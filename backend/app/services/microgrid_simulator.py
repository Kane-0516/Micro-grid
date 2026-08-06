"""
microgrid_simulator.py
=======================
    PyPSA                         ?

    ?
-         +     +        ?            
-      8760         
-                      
-                
-            
"""

from __future__ import annotations

from datetime import timedelta, timezone
import warnings
from functools import lru_cache

import httpx
import numpy as np
import pandas as pd
import pypsa
from pvlib import irradiance, inverter, pvsystem, solarposition, temperature

warnings.filterwarnings("ignore")


#                                                                                                                           
# 1.                 atlite            
#                                                                                                                           

_NASA_POWER_HOURLY_URL = "https://power.larc.nasa.gov/api/temporal/hourly/point"
_NASA_POWER_CLIMATOLOGY_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point"
_NASA_POWER_TIMEOUT = 12.0
_NASA_POWER_HOURLY_PARAMETERS = {
    "ALLSKY_SFC_SW_DWN": "ghi_wm2",
    "T2M": "temp_air_c",
    "WS2M": "wind_speed_mps",
}
_NASA_POWER_CLIMATOLOGY_PARAMETER = "SI_TILTED_AVG_OPTIMAL"
_NASA_POWER_CLIMATOLOGY_START_YEAR = 2001
_NASA_POWER_CLIMATOLOGY_END_YEAR = 2020
_PV_GAMMA_PDC = -0.004
_PV_SYSTEM_LOSS_FRACTION = 0.14
_PV_INVERTER_EFFICIENCY = 0.96
_PV_ALBEDO = 0.2
_PV_TEMPERATURE_MODEL = temperature.TEMPERATURE_MODEL_PARAMETERS["sapm"]["open_rack_glass_polymer"]


def _simulation_snapshots(year: int) -> pd.DatetimeIndex:
    return pd.date_range(f"{year}-01-01", periods=8760, freq="h")


@lru_cache(maxsize=256)
def _fetch_nasa_power_hourly_weather(latitude: float, longitude: float, year: int) -> pd.DataFrame:
    params = {
        "parameters": ",".join(_NASA_POWER_HOURLY_PARAMETERS),
        "community": "RE",
        "longitude": longitude,
        "latitude": latitude,
        "start": f"{year}0101",
        "end": f"{year}1231",
        "format": "JSON",
        "time-standard": "LST",
    }

    with httpx.Client(timeout=_NASA_POWER_TIMEOUT) as client:
        response = client.get(_NASA_POWER_HOURLY_URL, params=params)
        response.raise_for_status()
        payload = response.json()

    snapshots = _simulation_snapshots(year)
    parameter_data = payload.get("properties", {}).get("parameter", {})
    weather = pd.DataFrame(index=snapshots)

    for nasa_name, column_name in _NASA_POWER_HOURLY_PARAMETERS.items():
        parameter_block = parameter_data.get(nasa_name, {})
        if not isinstance(parameter_block, dict) or not parameter_block:
            if nasa_name == "ALLSKY_SFC_SW_DWN":
                raise ValueError(f"NASA POWER response missing {nasa_name} data")
            weather[column_name] = np.nan
            continue

        values: dict[pd.Timestamp, float] = {}
        for key, raw_value in parameter_block.items():
            try:
                value = float(raw_value)
            except (TypeError, ValueError):
                continue
            if value <= -900:
                continue
            timestamp = pd.to_datetime(str(key), format="%Y%m%d%H")
            values[timestamp] = value

        series = pd.Series(values, dtype=float).sort_index().reindex(snapshots)
        if series.isna().all():
            if nasa_name == "ALLSKY_SFC_SW_DWN":
                raise ValueError(f"NASA POWER hourly {nasa_name} did not align with simulation snapshots")
            weather[column_name] = np.nan
            continue

        weather[column_name] = series.interpolate(limit_direction="both").ffill().bfill()

    weather["ghi_wm2"] = weather["ghi_wm2"].clip(lower=0.0).fillna(0.0)
    weather["temp_air_c"] = weather.get("temp_air_c", pd.Series(index=snapshots, dtype=float)).fillna(25.0)
    weather["wind_speed_mps"] = weather.get("wind_speed_mps", pd.Series(index=snapshots, dtype=float)).clip(lower=0.0).fillna(1.0)
    return weather


def _fetch_nasa_power_hourly_irradiance(latitude: float, longitude: float, year: int) -> pd.Series:
    """Return NASA POWER hourly irradiance as kWh/m2 over each hour."""
    weather = _fetch_nasa_power_hourly_weather(latitude, longitude, year)
    return (weather["ghi_wm2"] / 1000.0).rename("ghi_kwh_m2")


@lru_cache(maxsize=256)
def fetch_nasa_power_climatology_tilted_solar_hours(
    latitude: float,
    longitude: float,
    start_year: int = _NASA_POWER_CLIMATOLOGY_START_YEAR,
    end_year: int = _NASA_POWER_CLIMATOLOGY_END_YEAR,
) -> dict[int, float]:
    params = {
        "parameters": _NASA_POWER_CLIMATOLOGY_PARAMETER,
        "community": "RE",
        "longitude": longitude,
        "latitude": latitude,
        "format": "JSON",
        "start": start_year,
        "end": end_year,
    }

    with httpx.Client(timeout=_NASA_POWER_TIMEOUT) as client:
        response = client.get(_NASA_POWER_CLIMATOLOGY_URL, params=params)
        response.raise_for_status()
        payload = response.json()

    values = (
        payload.get("properties", {})
        .get("parameter", {})
        .get(_NASA_POWER_CLIMATOLOGY_PARAMETER, {})
    )
    if not isinstance(values, dict) or not values:
        raise ValueError("NASA POWER climatology response missing tilted solar data")

    month_map = {
        "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
        "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
    }
    result: dict[int, float] = {}
    for key, month in month_map.items():
        raw = values.get(key)
        if raw is None:
            continue
        result[month] = float(raw)

    if len(result) != 12:
        raise ValueError(f"Incomplete climatology data returned: months={sorted(result)}")

    return result


def _timezone_from_longitude(longitude: float) -> timezone:
    utc_offset_hours = int(np.clip(np.round(longitude / 15.0), -12, 14))
    return timezone(timedelta(hours=utc_offset_hours))


def _estimate_surface_tilt(latitude: float) -> float:
    # Product PV panels are installed flat, so use a horizontal surface.
    return 0.0


def _estimate_surface_azimuth(latitude: float) -> float:
    # Azimuth has no physical effect when surface_tilt is 0 degrees.
    return 180.0


def _build_pvlib_pv_profile(
    latitude: float,
    longitude: float,
    year: int,
    panel_capacity_kw: float,
) -> pd.Series:
    snapshots = _simulation_snapshots(year)
    if panel_capacity_kw <= 0:
        return pd.Series(0.0, index=snapshots, name="pv_cf")

    weather = _fetch_nasa_power_hourly_weather(round(latitude, 4), round(longitude, 4), year)
    localized_snapshots = snapshots.tz_localize(_timezone_from_longitude(longitude))
    weather_local = weather.copy()
    weather_local.index = localized_snapshots

    solpos = solarposition.get_solarposition(localized_snapshots, latitude, longitude)
    solar_zenith = solpos["apparent_zenith"].clip(upper=90.0)
    solar_azimuth = solpos["azimuth"]

    ghi = weather_local["ghi_wm2"]
    dni = irradiance.disc(ghi, solar_zenith, localized_snapshots)["dni"]
    dni = pd.Series(dni, index=localized_snapshots, dtype=float).clip(lower=0.0).fillna(0.0)

    cos_zenith = pd.Series(
        np.clip(np.cos(np.radians(solar_zenith.to_numpy())), 0.0, None),
        index=localized_snapshots,
        dtype=float,
    )
    dhi = (ghi - dni * cos_zenith).clip(lower=0.0)

    surface_tilt = _estimate_surface_tilt(latitude)
    surface_azimuth = _estimate_surface_azimuth(latitude)
    dni_extra = irradiance.get_extra_radiation(localized_snapshots)
    poa = irradiance.get_total_irradiance(
        surface_tilt=surface_tilt,
        surface_azimuth=surface_azimuth,
        solar_zenith=solar_zenith,
        solar_azimuth=solar_azimuth,
        dni=dni,
        ghi=ghi,
        dhi=dhi,
        dni_extra=dni_extra,
        albedo=_PV_ALBEDO,
        model="haydavies",
    )
    poa_global = pd.Series(poa["poa_global"], index=localized_snapshots, dtype=float).clip(lower=0.0).fillna(0.0)

    temp_cell = temperature.sapm_cell(
        poa_global=poa_global,
        temp_air=weather_local["temp_air_c"],
        wind_speed=weather_local["wind_speed_mps"],
        **_PV_TEMPERATURE_MODEL,
    )
    pdc = pvsystem.pvwatts_dc(
        effective_irradiance=poa_global,
        temp_cell=temp_cell,
        pdc0=panel_capacity_kw * 1000.0,
        gamma_pdc=_PV_GAMMA_PDC,
    )
    pdc = pd.Series(pdc, index=localized_snapshots, dtype=float).clip(lower=0.0).fillna(0.0)
    pdc_net = pdc * (1.0 - _PV_SYSTEM_LOSS_FRACTION)
    pac = inverter.pvwatts(
        pdc=pdc_net,
        pdc0=panel_capacity_kw * 1000.0,
        eta_inv_nom=_PV_INVERTER_EFFICIENCY,
    )
    pac = pd.Series(pac, index=localized_snapshots, dtype=float).clip(lower=0.0).fillna(0.0)
    cf = (pac / (panel_capacity_kw * 1000.0)).clip(lower=0.0, upper=1.0)
    return pd.Series(cf.to_numpy(), index=snapshots, name="pv_cf")


def _generate_simplified_pv_profile(
    latitude: float = 35.0,
    year: int = 2020,
) -> pd.Series:
    snapshots = _simulation_snapshots(year)
    hours = np.arange(len(snapshots))

    day_of_year = snapshots.day_of_year.values
    solar_declination = 23.45 * np.sin(np.radians(360 / 365 * (day_of_year - 81)))
    max_sun_hours = np.clip(
        2 / 15 * np.degrees(
            np.arccos(-np.tan(np.radians(latitude)) * np.tan(np.radians(solar_declination)))
        ),
        0, 24
    )

    hour_of_day = hours % 24
    sunrise = 12 - max_sun_hours / 2
    sunset = 12 + max_sun_hours / 2

    cf = np.zeros(len(snapshots))
    for i in range(len(snapshots)):
        h = hour_of_day[i]
        if sunrise[i] < h < sunset[i]:
            angle = np.pi * (h - sunrise[i]) / (sunset[i] - sunrise[i])
            cf[i] = max(0, np.sin(angle) ** 1.2)

    np.random.seed(42)
    cloud_factor = np.ones(len(snapshots))

    h = 0
    while h < len(snapshots):
        if np.random.random() < 0.18:
            dur = int(np.random.uniform(2, 7) * 24)
            end = min(h + dur, len(snapshots))
            intens = np.random.uniform(0.05, 0.45)
            cloud_factor[h:end] = intens
            h = end + int(np.random.uniform(5, 15) * 24)
        else:
            h += 24

    total_days = max(1, len(snapshots) // 24)
    partial_days = np.random.choice(total_days, size=max(1, int(total_days * 0.10)), replace=False)
    for day in partial_days:
        s, e = day * 24, min((day + 1) * 24, len(snapshots))
        cloud_factor[s:e] = np.where(
            cloud_factor[s:e] == 1.0,
            np.random.uniform(0.4, 0.8),
            cloud_factor[s:e]
        )

    cf = cf * cloud_factor
    return pd.Series(cf, index=snapshots, name="pv_cf")


def generate_pv_profile(
    latitude: float = 35.0,
    longitude: float = 0.0,
    year: int = 2020,
    panel_capacity_kw: float = 1.0,
    generation_correction_factor: float = 1.0,
) -> pd.Series:
    """Generate hourly PV availability with NASA POWER weather plus pvlib."""
    factor = max(0.0, float(generation_correction_factor or 1.0))
    try:
        profile = _build_pvlib_pv_profile(
            latitude=latitude,
            longitude=longitude,
            year=year,
            panel_capacity_kw=panel_capacity_kw,
        )
    except Exception:
        profile = _generate_simplified_pv_profile(latitude=latitude, year=year)
    return (profile * factor).clip(lower=0.0, upper=1.0)



def generate_load_profile(
    annual_consumption_kwh: float,
    load_type: str = "residential",
    year: int = 2020,
) -> pd.Series:
    """
               W   ?

    Parameters
    ----------
    annual_consumption_kwh : float
                  Wh ?
    load_type : str
               ?residential'      | 'commercial'      | 'industrial'      
    year : int
              
    Returns
    -------
    pd.Series
                    kW       ?DatetimeIndex
    """
    snapshots = pd.date_range(f"{year}-01-01", periods=8760, freq="h")
    hour_of_day = np.arange(8760) % 24
    day_of_year = snapshots.day_of_year.values

    if load_type == "residential":
        #           ?
        base = np.ones(8760)
        morning_peak = np.exp(-0.5 * ((hour_of_day - 8) / 1.5) ** 2)
        evening_peak = np.exp(-0.5 * ((hour_of_day - 19) / 2.0) ** 2)
        daily_pattern = base * 0.3 + morning_peak * 0.7 + evening_peak * 1.0
    elif load_type == "commercial":
        #           ?
        daily_pattern = np.where(
            (hour_of_day >= 8) & (hour_of_day <= 20),
            1.0 + 0.3 * np.sin(np.pi * (hour_of_day - 8) / 12),
            0.15,
        ).astype(float)
    else:
        #     ?4         
        daily_pattern = np.ones(8760) * 0.85 + 0.15 * np.random.rand(8760)

    #                      
    seasonal = 1.0 + 0.2 * np.cos(2 * np.pi * (day_of_year - 180) / 365)
    load_pattern = daily_pattern * seasonal

    #             
    avg_kw = annual_consumption_kwh / 8760
    load_kw = load_pattern / load_pattern.mean() * avg_kw

    return pd.Series(load_kw, index=snapshots, name="load_kw")


#                                                                                                                           
# 2. PyPSA                
#                                                                                                                           

class OffGridMicrogridSimulator:
    """Run an off-grid microgrid dispatch model with PyPSA."""

    def __init__(
        self,
        pv_capacity_kw: float,
        battery_capacity_kwh: float,
        battery_power_kw: float,
        diesel_capacity_kw: float,
        load_profile: pd.Series,
        pv_profile: pd.Series,
        battery_efficiency: float = 0.95,
        diesel_fuel_cost: float = 1.5,     #  ?kWh          ?
        diesel_min_load_pu: float = 0.25,
        diesel_committable: bool = False,
        diesel_start_up_cost: float = 0.25,
        diesel_shut_down_cost: float = 0.05,
        diesel_min_up_time: int = 1,
        diesel_min_down_time: int = 1,
        battery_reserve_soc_pu: float = 0.15,
        verbose: bool = False,
    ):
        """
        Parameters
        ----------
        pv_capacity_kw : float
                       W ?
        battery_capacity_kwh : float
                       Wh ?
        battery_power_kw : float
                           kW ?
        diesel_capacity_kw : float
                           kW   0             
        load_profile : pd.Series
                        kW       ?DatetimeIndex
        pv_profile : pd.Series
                           0~1       ?DatetimeIndex
        battery_efficiency : float
                            ?
        diesel_fuel_cost : float
                        /kWh ?
        verbose : bool
                        
        """
        self.pv_capacity_kw = pv_capacity_kw
        self.battery_capacity_kwh = battery_capacity_kwh
        self.battery_power_kw = battery_power_kw
        self.diesel_capacity_kw = diesel_capacity_kw
        self.load_profile = load_profile
        self.pv_profile = pv_profile
        self.battery_efficiency = battery_efficiency
        self.diesel_fuel_cost = diesel_fuel_cost
        self.diesel_min_load_pu = diesel_min_load_pu
        self.diesel_committable = diesel_committable
        self.diesel_start_up_cost = diesel_start_up_cost
        self.diesel_shut_down_cost = diesel_shut_down_cost
        self.diesel_min_up_time = diesel_min_up_time
        self.diesel_min_down_time = diesel_min_down_time
        self.battery_reserve_soc_pu = max(0.0, min(0.95, battery_reserve_soc_pu))
        self.verbose = verbose

        self.network: pypsa.Network | None = None
        self.results: dict = {}

    def build_network(self) -> pypsa.Network:
        """Build the PyPSA network for the configured system."""
        n = pypsa.Network()
        snapshots = self.load_profile.index
        n.set_snapshots(snapshots)

        #                                                                         
        n.add("Carrier", "AC", co2_emissions=0)
        n.add("Carrier", "solar", co2_emissions=0)
        n.add("Carrier", "battery", co2_emissions=0)
        n.add("Carrier", "diesel", co2_emissions=2.68)  # kgCO ?L  ?kgCO ?kWh

        #                ?                                                  
        n.add("Bus", "AC_bus", carrier="AC", v_nom=0.4)  # 400V    

        #             ?                                                          
        n.add(
            "Generator", "PV",
            bus="AC_bus",
            carrier="solar",
            p_nom=self.pv_capacity_kw,
            p_max_pu=self.pv_profile,
            p_min_pu=0,
            marginal_cost=0,
            capital_cost=0,  #                    ?
        )

        #                                                                           
        max_hours = self.battery_capacity_kwh / max(self.battery_power_kw, 1e-6)
        n.add(
            "StorageUnit", "Battery",
            bus="AC_bus",
            carrier="battery",
            p_nom=self.battery_power_kw,
            max_hours=max_hours,
            efficiency_store=self.battery_efficiency,
            efficiency_dispatch=self.battery_efficiency,
            cyclic_state_of_charge=True,
            state_of_charge_initial=self.battery_capacity_kwh * 0.5,
            state_of_charge_min=self.battery_capacity_kwh * self.battery_reserve_soc_pu,
            capital_cost=0,
        )

        #                                                               
        if self.diesel_capacity_kw > 0:
            diesel_kwargs = {
                "bus": "AC_bus",
                "carrier": "diesel",
                "p_nom": self.diesel_capacity_kw,
                "p_min_pu": self.diesel_min_load_pu if self.diesel_committable else 0.0,
                "marginal_cost": self.diesel_fuel_cost,
                "capital_cost": 0,
            }
            if self.diesel_committable:
                diesel_kwargs.update({
                    "committable": True,
                    "start_up_cost": self.diesel_start_up_cost,
                    "shut_down_cost": self.diesel_shut_down_cost,
                    "min_up_time": self.diesel_min_up_time,
                    "min_down_time": self.diesel_min_down_time,
                })

            n.add("Generator", "Diesel", **diesel_kwargs)

        #                                                                 
        n.add("Load", "Load", bus="AC_bus", p_set=self.load_profile)

        #                                          
        n.add(
            "Generator", "Curtailment",
            bus="AC_bus",
            carrier="AC",
            p_nom=self.pv_capacity_kw * 2,
            p_min_pu=-1,  #    "   ?               
            p_max_pu=0,   #          
            marginal_cost=-0.001,  #                
        )

        #                                         
        n.add(
            "Generator", "LoadShedding",
            bus="AC_bus",
            carrier="AC",
            p_nom=self.load_profile.max() * 1.5,
            marginal_cost=999,  #       
            capital_cost=0,
        )

        self.network = n
        if self.verbose:
            print(n)
        return n

    def run_simulation(self, solver_name: str = "highs") -> dict:
        """Run the operational simulation and return summary metrics."""
        if self.network is None:
            self.build_network()

        n = self.network

        #               
        status = n.optimize(solver_name=solver_name, solver_options={"output_flag": False})

        if "optimal" not in str(status).lower() and status is not True:
            print(f" ?      ? {status}            ")

        #                                                                    
        pv_gen_kwh = n.generators_t.p["PV"].sum()
        load_kwh = n.loads_t.p["Load"].sum()
        load_shed_kwh = n.generators_t.p.get("LoadShedding", pd.Series(0)).sum()
        curtail_kwh = abs(n.generators_t.p.get("Curtailment", pd.Series(0)).clip(upper=0).sum())

        diesel_kwh = 0.0
        diesel_hours = 0
        diesel_starts = 0
        diesel_series = pd.Series(0.0, index=n.snapshots)
        diesel_status = pd.Series(0.0, index=n.snapshots)
        if self.diesel_capacity_kw > 0 and "Diesel" in n.generators_t.p.columns:
            diesel_series = n.generators_t.p["Diesel"]
            diesel_kwh = diesel_series.sum()
            if (
                self.diesel_committable
                and hasattr(n.generators_t, "status")
                and "Diesel" in n.generators_t.status.columns
                and not n.generators_t.status.empty
            ):
                diesel_status = n.generators_t.status["Diesel"].fillna(0.0).clip(lower=0.0)
            else:
                diesel_status = self._estimate_diesel_commitment(diesel_series)

            diesel_hours = int((diesel_status > 0.5).sum())
            diesel_starts = int((diesel_status.diff().fillna(diesel_status.iloc[0]) > 0.5).sum())

        battery_charge_kwh = n.storage_units_t.p_store["Battery"].sum()
        battery_discharge_kwh = n.storage_units_t.p_dispatch["Battery"].sum()
        soc_series = n.storage_units_t.state_of_charge["Battery"]

        # PV production can exceed annual load when the system curtails surplus
        # energy. For the user-facing solar share, count only utilized PV energy.
        pv_utilized_kwh = max(0.0, pv_gen_kwh - curtail_kwh)
        solar_fraction = min(1.0, pv_utilized_kwh / max(load_kwh, 1e-6))
        loss_of_load = load_shed_kwh / max(load_kwh, 1e-6)   #       
        curtailment_rate = curtail_kwh / max(pv_gen_kwh, 1e-6)  #     ?

        #                             ?
        hourly_deficit = n.generators_t.p.get("LoadShedding", pd.Series(0, index=n.snapshots))
        daily_deficit = hourly_deficit.resample("D").sum()
        max_continuous_deficit_days = self._max_continuous_deficit_days(daily_deficit)

        self.results = {
            #         Wh/   
            "annual_pv_generation_kwh": round(pv_gen_kwh, 1),
            "annual_pv_utilized_kwh": round(pv_utilized_kwh, 1),
            "annual_load_kwh": round(load_kwh, 1),
            "annual_load_shed_kwh": round(load_shed_kwh, 1),
            "annual_curtailment_kwh": round(curtail_kwh, 1),
            "annual_diesel_kwh": round(diesel_kwh, 1),
            "annual_battery_charge_kwh": round(battery_charge_kwh, 1),
            "annual_battery_discharge_kwh": round(battery_discharge_kwh, 1),

            #       
            "solar_fraction": round(solar_fraction * 100, 1),       #        ?%
            "loss_of_load_rate": round(loss_of_load * 100, 3),      #        %
            "curtailment_rate": round(curtailment_rate * 100, 1),   #     ?%
            "diesel_run_hours": diesel_hours,                        #             ?
            "diesel_start_count": diesel_starts,                     #             

            #        ?
            "max_autonomous_days": max_continuous_deficit_days,      #                   ?
            "battery_avg_soc": round(soc_series.mean(), 1),          #            kWh ?
            "battery_min_soc": round(soc_series.min(), 1),

            #                   
            "_soc_series": soc_series,
            "_load_shed_series": hourly_deficit,
            "_pv_series": n.generators_t.p["PV"],
            "_diesel_series": diesel_series,
            "_diesel_status_series": diesel_status,
        }

        return self.results

    @staticmethod
    def _max_continuous_deficit_days(daily_deficit: pd.Series) -> int:
        """Count the longest streak of days with almost no deficit."""
        #        ?    ?      
        no_deficit = (daily_deficit < 0.01).astype(int)
        max_streak = 0
        current_streak = 0
        for v in no_deficit:
            if v:
                current_streak += 1
                max_streak = max(max_streak, current_streak)
            else:
                current_streak = 0
        return max_streak

    def _estimate_diesel_commitment(self, diesel_series: pd.Series) -> pd.Series:
        """
            ?LP                            ?

            ?
        -                                         
        -          ?                     ?
        """
        if diesel_series.empty or self.diesel_capacity_kw <= 0:
            return pd.Series(0.0, index=diesel_series.index)

        # HOMER hours are closer to hours with actual generator output than a
        # conservative commitment-state estimate.
        threshold_kw = max(0.01, self.diesel_capacity_kw * 0.01)
        status = diesel_series.ge(threshold_kw).astype(float)

        status = self._enforce_min_state_duration(status, 1.0, max(int(self.diesel_min_up_time), 1))
        status = self._enforce_min_state_duration(status, 0.0, max(int(self.diesel_min_down_time), 1))
        return status.astype(float)

    @staticmethod
    def _enforce_min_state_duration(status: pd.Series, state_value: float, min_duration: int) -> pd.Series:
        if min_duration <= 1 or status.empty:
            return status

        arr = status.astype(int).to_numpy(copy=True)
        n = len(arr)
        i = 0
        target = 1 if state_value >= 0.5 else 0

        while i < n:
            j = i
            while j < n and arr[j] == arr[i]:
                j += 1

            run_length = j - i
            if arr[i] == target and run_length < min_duration:
                arr[i:j] = 1 - target

            i = j

        return pd.Series(arr.astype(float), index=status.index)


class MicrogridOptimizer:
    """Optimize battery size with repeated PyPSA simulations."""

    def __init__(
        self,
        pv_capacity_kw: float,
        load_profile: pd.Series,
        pv_profile: pd.Series,
        diesel_capacity_kw: float = 0,
        battery_power_cost_per_kw: float = 2000,    #  ?kW      
        battery_energy_cost_per_kwh: float = 1500,  #  ?kWh      
        max_loss_of_load: float = 0.01,             #             ?1%
    ):
        self.pv_capacity_kw = pv_capacity_kw
        self.load_profile = load_profile
        self.pv_profile = pv_profile
        self.diesel_capacity_kw = diesel_capacity_kw
        self.battery_power_cost_per_kw = battery_power_cost_per_kw
        self.battery_energy_cost_per_kwh = battery_energy_cost_per_kwh
        self.max_loss_of_load = max_loss_of_load

    def optimize(self, solver_name: str = "highs") -> dict:
        """
            PyPSA                             ?

        Returns
        -------
        dict
                                         ?
        """
        n = pypsa.Network()
        n.set_snapshots(self.load_profile.index)

        n.add("Carrier", "AC")
        n.add("Carrier", "solar")
        n.add("Carrier", "battery")
        n.add("Carrier", "diesel")

        n.add("Bus", "AC_bus", carrier="AC")

        #             
        n.add("Generator", "PV", bus="AC_bus", carrier="solar",
              p_nom=self.pv_capacity_kw, p_max_pu=self.pv_profile, marginal_cost=0)

        #              ?
        if self.diesel_capacity_kw > 0:
            n.add("Generator", "Diesel", bus="AC_bus", carrier="diesel",
                  p_nom=self.diesel_capacity_kw, p_min_pu=0.0, marginal_cost=1.5)

        #                  ?             StorageUnit  ?Store    
        n.add(
            "StorageUnit", "Battery",
            bus="AC_bus",
            carrier="battery",
            p_nom_extendable=True,       #           ?
            p_nom_min=0,
            p_nom_max=self.pv_capacity_kw * 2,
            max_hours=8,                 #    ?8h           ?
            efficiency_store=0.95,
            efficiency_dispatch=0.95,
            cyclic_state_of_charge=True,
            capital_cost=self.battery_power_cost_per_kw + self.battery_energy_cost_per_kwh * 8,
        )

        #    
        n.add("Load", "Load", bus="AC_bus", p_set=self.load_profile)

        #                 ?
        penalty = 10000  #  ?kWh    
        n.add("Generator", "LoadShedding", bus="AC_bus", carrier="AC",
              p_nom=self.load_profile.max() * 2, marginal_cost=penalty)

        #           sink ?
        n.add("Generator", "Curtailment", bus="AC_bus", carrier="AC",
              p_nom=self.pv_capacity_kw * 2, p_min_pu=-1, p_max_pu=0, marginal_cost=-0.001)

        #      
        n.optimize(solver_name=solver_name, solver_options={"output_flag": False})

        opt_battery_kw = n.storage_units.at["Battery", "p_nom_opt"]
        opt_battery_kwh = opt_battery_kw * 8

        return {
            "optimal_battery_power_kw": round(opt_battery_kw, 1),
            "optimal_battery_energy_kwh": round(opt_battery_kwh, 1),
            "annual_load_shed_kwh": round(n.generators_t.p["LoadShedding"].sum(), 1),
        }


#                                                                                                                           
# 3.                       generate_load_profile ?
#                                                                                                                           

def generate_load_profile_from_current_spec(
    voltage_v: float,
    current_schedule: list,
    year: int = 2020,
    power_factor: float = 1.0,
    annual_kwh_override: float = None,
) -> pd.Series:
    """Build an hourly load profile from a current schedule."""
    snapshots   = pd.date_range(f"{year}-01-01", periods=8760, freq="h")
    hour_of_day = np.arange(8760) % 24
    load_kw     = np.zeros(8760)

    for start_h, end_h, current_a in current_schedule:
        power_kw = voltage_v * current_a * power_factor / 1000.0
        s = int(start_h) % 24

        if end_h <= 24:
            #       
            e = int(end_h) % 24 if int(end_h) % 24 != 0 else 24
            mask = (hour_of_day >= s) & (hour_of_day < e)
        else:
            #           20:00  ?32:00     20:00    ?8:00 ?
            e = int(end_h) - 24
            mask = (hour_of_day >= s) | (hour_of_day < e)

        load_kw[mask] = power_kw

    if annual_kwh_override is not None:
        base_kwh = load_kw.sum()   # 1h   kW = kWh
        if base_kwh > 0:
            load_kw = load_kw * (annual_kwh_override / base_kwh)

    return pd.Series(load_kw, index=snapshots, name="load_kw")


#                                                                                                                           
# 4.                 HOMER Pro A       ?
#                                                                                                                           

class DieselOnlySimulator:
    """Simulate the diesel-only reference case with PyPSA."""

    def __init__(
        self,
        diesel_capacity_kw: float,
        load_profile: pd.Series,
        min_load_pu: float = 0.25,
        diesel_fuel_cost_usd_per_kwh: float = 0.297,  # $0.95/L   3.2kWh/L
        diesel_kwh_per_liter: float = 3.2,
        verbose: bool = False,
    ):
        """
        Parameters
        ----------
        diesel_capacity_kw : float
                        kW ?
        load_profile : pd.Series
                        kW ?
        min_load_pu : float
                                 ?0.3 ?0% ?
        diesel_fuel_cost_usd_per_kwh : float
                         ?kWh     ?     ?$/L)         (kWh/L)
        diesel_kwh_per_liter : float
                       Wh/L       kWh  ? ?   
        """
        self.diesel_capacity_kw     = diesel_capacity_kw
        self.load_profile           = load_profile
        self.min_load_pu            = min_load_pu
        self.diesel_fuel_cost       = diesel_fuel_cost_usd_per_kwh
        self.diesel_kwh_per_liter   = diesel_kwh_per_liter
        self.verbose                = verbose
        self.network: pypsa.Network | None = None
        self.results: dict = {}

    def build_network(self) -> pypsa.Network:
        """Build the PyPSA network for the diesel-only case."""
        n = pypsa.Network()
        n.set_snapshots(self.load_profile.index)

        n.add("Carrier", "AC",     co2_emissions=0)
        n.add("Carrier", "diesel", co2_emissions=2.68)

        n.add("Bus", "AC_bus", carrier="AC", v_nom=0.4)

        #                                                          
        n.add(
            "Generator", "Diesel",
            bus="AC_bus",
            carrier="diesel",
            p_nom=self.diesel_capacity_kw,
            p_min_pu=self.min_load_pu,
            p_max_pu=1.0,
            marginal_cost=self.diesel_fuel_cost,
            capital_cost=0,
        )

        #                                                                                              
        n.add("Load", "Load", bus="AC_bus", p_set=self.load_profile)

        #                                                  
        #     ?< diesel_min_load           ?diesel_min_load ?
        #        ?DumpLoad                ?
        n.add(
            "Generator", "DumpLoad",
            bus="AC_bus",
            carrier="AC",
            p_nom=self.diesel_capacity_kw,
            p_min_pu=-1,   #                    ?
            p_max_pu=0,    #        ?
            marginal_cost=-0.001,
        )

        #                                                        
        n.add(
            "Generator", "LoadShedding",
            bus="AC_bus",
            carrier="AC",
            p_nom=self.load_profile.max() * 1.5,
            marginal_cost=999,
            capital_cost=0,
        )

        self.network = n
        if self.verbose:
            print(n)
        return n

    def run_simulation(self, solver_name: str = "highs") -> dict:
        """
                      ?

        Returns
        -------
        dict
            annual_diesel_kwh_generated :                    ?
            annual_load_kwh             :       ?
            annual_dump_kwh             :                       ?
            annual_load_shed_kwh        :                      
            diesel_run_hours            :             8760 ?
            diesel_liters_per_year      :           ?
            effective_load_efficiency   :           =    /   
        """
        if self.network is None:
            self.build_network()

        n = self.network
        status = n.optimize(solver_name=solver_name, solver_options={"output_flag": False})
        if "optimal" not in str(status).lower() and status is not True:
            print(f"   ?      ? {status}")

        diesel_series  = n.generators_t.p["Diesel"]
        diesel_kwh     = diesel_series.sum()
        diesel_hours   = int((diesel_series > 0.01).sum())
        dump_kwh       = abs(
            n.generators_t.p.get("DumpLoad", pd.Series(0)).clip(upper=0).sum()
        )
        load_shed_kwh  = n.generators_t.p.get("LoadShedding", pd.Series(0)).sum()
        load_kwh       = n.loads_t.p["Load"].sum()
        diesel_liters  = diesel_kwh / self.diesel_kwh_per_liter

        self.results = {
            "annual_diesel_kwh_generated": round(diesel_kwh, 1),
            "annual_load_kwh":             round(load_kwh, 1),
            "annual_dump_kwh":             round(dump_kwh, 1),
            "annual_load_shed_kwh":        round(load_shed_kwh, 1),
            "diesel_run_hours":            diesel_hours,
            "diesel_liters_per_year":      round(diesel_liters, 0),
            "effective_load_efficiency":   round(load_kwh / max(diesel_kwh, 1e-6), 3),
        }

        if self.verbose:
            print("[DieselOnlySimulator]")
            print(f"diesel generation: {diesel_kwh:>10,.1f} kWh")
            print(f"load served:       {load_kwh:>10,.1f} kWh")
            print(f"dumped energy:     {dump_kwh:>10,.1f} kWh")
            print(f"diesel liters:     {diesel_liters:>10,.0f} L")
            print(f"run hours:         {diesel_hours:>10,} h/year")

        return self.results



