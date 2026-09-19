"""NASA POWER I/O: on-disk response cache and concurrent multi-year prefetch.

Cold sandboxes were paying ~140 s because the twenty-year analysis issued 20
sequential HTTP requests to NASA POWER with no persistent cache. These tests
pin the two I/O behaviours that remove that cost without touching any of the
numerical logic: responses are replayed from disk, and the years are fetched
concurrently before the first simulation starts.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import httpx
import pandas as pd
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services import microgrid_simulator, nasa_power  # noqa: E402
from app.services import simulator as simulator_module  # noqa: E402

_LAT, _LON = 33.4, -112.0


def _hourly_payload(year: int) -> dict:
    """Minimal NASA POWER hourly payload: a few valid hours per parameter."""
    keys = [f"{year}0101{h:02d}" for h in range(0, 24, 6)]
    return {
        "properties": {
            "parameter": {
                "ALLSKY_SFC_SW_DWN": {k: 400.0 for k in keys},
                "T2M": {k: 20.0 for k in keys},
                "WS2M": {k: 2.0 for k in keys},
            }
        }
    }


def _install_mock_nasa(monkeypatch, delay_s: float = 0.0):
    """Route every NASA client through an in-memory transport; log requests."""
    log: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        year = int(request.url.params["start"][:4])
        log.append(year)
        if delay_s:
            time.sleep(delay_s)
        return httpx.Response(200, json=_hourly_payload(year))

    def new_client(timeout: float) -> httpx.Client:
        return httpx.Client(
            transport=httpx.MockTransport(handler), timeout=timeout
        )

    monkeypatch.setattr(nasa_power, "_new_client", new_client)
    return log


@pytest.fixture(autouse=True)
def _isolated_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(nasa_power, "CACHE_DIR", tmp_path / "nasa_power")
    microgrid_simulator._fetch_nasa_power_hourly_weather.cache_clear()
    yield
    microgrid_simulator._fetch_nasa_power_hourly_weather.cache_clear()


def test_fetch_json_replays_from_disk_without_network(monkeypatch, tmp_path):
    """Second call for identical params is served from the on-disk copy."""
    log = _install_mock_nasa(monkeypatch)
    params = {"start": "20200101", "latitude": _LAT, "longitude": _LON}

    first = nasa_power.fetch_json(
        "https://example.test/hourly", params, timeout=5
    )
    second = nasa_power.fetch_json(
        "https://example.test/hourly", params, timeout=5
    )

    assert first == second == _hourly_payload(2020)
    assert log == [2020], "second call must be served from disk, not NASA"
    assert any((tmp_path / "nasa_power").iterdir()), (
        "response was not persisted"
    )


def test_corrupt_cache_file_is_discarded_and_refetched(monkeypatch, tmp_path):
    """A truncated .json.gz must not poison the site forever.

    Without this, the read raises, generate_pv_profile swallows it and
    silently substitutes a synthetic sine profile for that year.
    """
    log = _install_mock_nasa(monkeypatch)
    params = {"start": "20200101", "latitude": _LAT, "longitude": _LON}
    url = "https://example.test/hourly"
    nasa_power.fetch_json(url, params, timeout=5)
    (cached,) = (tmp_path / "nasa_power").glob("*.json.gz")
    cached.write_bytes(cached.read_bytes()[: cached.stat().st_size // 2])

    payload = nasa_power.fetch_json(url, params, timeout=5)

    assert payload == _hourly_payload(2020)
    assert log == [2020, 2020], "corrupt entry must trigger one refetch"
    assert nasa_power.fetch_json(url, params, timeout=5) == payload
    assert log == [2020, 2020], "the refetched copy must be re-persisted"


def test_hourly_weather_survives_process_cache_reset(monkeypatch):
    """A fresh process (lru_cache empty) must still not hit the network."""
    log = _install_mock_nasa(monkeypatch)

    microgrid_simulator._fetch_nasa_power_hourly_weather(_LAT, _LON, 2020)
    microgrid_simulator._fetch_nasa_power_hourly_weather.cache_clear()
    weather = microgrid_simulator._fetch_nasa_power_hourly_weather(
        _LAT, _LON, 2020
    )

    assert log == [2020]
    assert len(weather) == 8760
    assert weather["ghi_wm2"].max() == pytest.approx(400.0)


def test_prefetch_fetches_years_concurrently(monkeypatch):
    """Six 0.3 s requests finish in one round-trip, not 1.8 s sequential."""
    years = list(range(2001, 2007))
    log = _install_mock_nasa(monkeypatch, delay_s=0.3)

    started = time.perf_counter()
    microgrid_simulator.prefetch_nasa_power_hourly_weather(_LAT, _LON, years)
    elapsed = time.perf_counter() - started

    assert sorted(log) == years
    assert elapsed < 1.0, (
        f"prefetch took {elapsed:.2f}s; years were not fetched in parallel"
    )


def test_twenty_year_analysis_fetches_all_years_before_first_simulation(
    monkeypatch,
):
    """Weather for every year is prefetched before PyPSA runs year one."""
    log = _install_mock_nasa(monkeypatch)
    events: list[str] = []
    log_seen = 0

    class _RecordingSimulator:
        """Stands in for PyPSA: records when a simulation starts."""

        def __init__(self, **_: object) -> None:
            pass

        def build_network(self) -> None:
            pass

        def run_simulation(self, solver_name: str = "highs") -> dict:
            nonlocal log_seen
            events.extend(["fetch"] * (len(log) - log_seen))
            log_seen = len(log)
            events.append("sim")
            return {}

    monkeypatch.setattr(
        simulator_module, "OffGridMicrogridSimulator", _RecordingSimulator
    )

    result = simulator_module._build_twenty_year_average_solar_diesel_analysis(
        pv_kw=10.0,
        battery_kwh=20.0,
        microgrid_diesel_kw=5.0,
        annual_load_kwh=12_000.0,
        load_type="residential",
        microgrid_diesel_eff=3.2,
        diesel_price=1.0,
        latitude=_LAT,
        longitude=_LON,
        start_year=2001,
        end_year=2003,
    )
    assert sorted(log) == [2001, 2002, 2003], "each year fetched once"
    assert events[:4] == ["fetch", "fetch", "fetch", "sim"], events
    assert result["analysisPeriod"].startswith("2001-2003")


def test_twenty_year_analysis_without_pv_makes_no_weather_requests(
    monkeypatch,
):
    """Diesel-only sizing never fetched weather before; it must not start."""
    log = _install_mock_nasa(monkeypatch)

    class _NoopSimulator:
        def __init__(self, **_: object) -> None:
            pass

        def build_network(self) -> None:
            pass

        def run_simulation(self, solver_name: str = "highs") -> dict:
            return {}

    monkeypatch.setattr(
        simulator_module, "OffGridMicrogridSimulator", _NoopSimulator
    )
    simulator_module._build_twenty_year_average_solar_diesel_analysis(
        pv_kw=0.0,
        battery_kwh=20.0,
        microgrid_diesel_kw=5.0,
        annual_load_kwh=12_000.0,
        load_type="residential",
        microgrid_diesel_eff=3.2,
        diesel_price=1.0,
        latitude=_LAT,
        longitude=_LON,
        start_year=2001,
        end_year=2003,
    )
    assert log == [], f"pv_kw=0 must not touch NASA, but fetched {log}"


def _reference_parse(parameter_block: dict, snapshots) -> pd.Series:
    """The original per-key parser, kept verbatim as the numerical oracle."""
    values: dict[pd.Timestamp, float] = {}
    for key, raw_value in parameter_block.items():
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            continue
        if value > -900:
            values[pd.to_datetime(str(key), format="%Y%m%d%H")] = value
    return pd.Series(values, dtype=float).sort_index().reindex(snapshots)


def test_parse_nasa_parameter_is_vectorised_and_value_identical(monkeypatch):
    """A full year parses in one to_datetime call with unchanged values.

    The per-key loop cost ~0.5 s per parameter per year (26k pandas calls),
    which on a 2-vCPU sandbox is the bulk of the 140 s "cold start".
    """
    snapshots = microgrid_simulator._simulation_snapshots(2020)
    block = {
        ts.strftime("%Y%m%d%H"): float(i % 700)
        for i, ts in enumerate(snapshots)
    }
    block["2020030512"] = -999.0  # NASA sentinel: must become a gap
    block["2020070100"] = "n/a"  # unparsable: must be skipped
    del block["2020123023"]  # missing hour: must reindex to NaN

    calls: list[int] = []
    real_to_datetime = pd.to_datetime

    def counting_to_datetime(*args, **kwargs):
        calls.append(1)
        return real_to_datetime(*args, **kwargs)

    expected = _reference_parse(block, snapshots)
    monkeypatch.setattr(pd, "to_datetime", counting_to_datetime)
    actual = microgrid_simulator._parse_nasa_parameter(block, snapshots)

    pd.testing.assert_series_equal(actual, expected)
    assert len(calls) <= 1, f"to_datetime called {len(calls)} times"
