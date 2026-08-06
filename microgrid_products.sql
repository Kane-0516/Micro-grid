--
-- PostgreSQL database dump
--

\restrict C4jZIdIXPQgYsACVhc8FB9RryAdu7yKeAn8dpVarqAOhOB8r5HswWgIeJwhUJ3K

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: battery_packs; Type: TABLE; Schema: public; Owner: microgrid
--

CREATE TABLE public.battery_packs (
    model text NOT NULL,
    display_name text NOT NULL,
    display_name_en text DEFAULT ''::text,
    display_name_zh text DEFAULT ''::text,
    capacity_kwh double precision NOT NULL,
    price_usd double precision NOT NULL,
    voltage_v double precision DEFAULT 51.2,
    cycle_life integer DEFAULT 4000,
    depth_of_discharge_pct double precision DEFAULT 90.0,
    description text DEFAULT ''::text
);


ALTER TABLE public.battery_packs OWNER TO microgrid;

--
-- Name: bracket_systems; Type: TABLE; Schema: public; Owner: microgrid
--

CREATE TABLE public.bracket_systems (
    model text NOT NULL,
    display_name text NOT NULL,
    display_name_en text DEFAULT ''::text,
    display_name_zh text DEFAULT ''::text,
    panels_per_set integer NOT NULL,
    area_m2 double precision NOT NULL,
    footprint_length_m double precision DEFAULT 28.0,
    footprint_width_m double precision DEFAULT 5.6,
    description text DEFAULT ''::text
);


ALTER TABLE public.bracket_systems OWNER TO microgrid;

--
-- Name: catalog_blobs; Type: TABLE; Schema: public; Owner: microgrid
--

CREATE TABLE public.catalog_blobs (
    key text NOT NULL,
    json_value jsonb NOT NULL
);


ALTER TABLE public.catalog_blobs OWNER TO microgrid;

--
-- Name: catalog_meta; Type: TABLE; Schema: public; Owner: microgrid
--

CREATE TABLE public.catalog_meta (
    key text NOT NULL,
    value_json jsonb NOT NULL
);


ALTER TABLE public.catalog_meta OWNER TO microgrid;

--
-- Name: diesel_generators; Type: TABLE; Schema: public; Owner: microgrid
--

CREATE TABLE public.diesel_generators (
    model text NOT NULL,
    display_name text NOT NULL,
    display_name_en text DEFAULT ''::text,
    display_name_zh text DEFAULT ''::text,
    power_kw double precision NOT NULL,
    price_usd double precision NOT NULL,
    fuel_efficiency_kwh_per_liter double precision DEFAULT 3.5,
    description text DEFAULT ''::text,
    fuel_intercept_coeff double precision DEFAULT 0.033,
    fuel_slope_coeff double precision DEFAULT 0.273
);


ALTER TABLE public.diesel_generators OWNER TO microgrid;

--
-- Name: integrated_pv_storage; Type: TABLE; Schema: public; Owner: microgrid
--

CREATE TABLE public.integrated_pv_storage (
    model text NOT NULL,
    display_name text NOT NULL,
    display_name_en text DEFAULT ''::text,
    display_name_zh text DEFAULT ''::text,
    pv_kw double precision NOT NULL,
    battery_kwh double precision NOT NULL,
    battery_kw double precision NOT NULL,
    diesel_ratio double precision DEFAULT 1.0
);


ALTER TABLE public.integrated_pv_storage OWNER TO microgrid;

--
-- Name: inverters; Type: TABLE; Schema: public; Owner: microgrid
--

CREATE TABLE public.inverters (
    model text NOT NULL,
    display_name text NOT NULL,
    display_name_en text DEFAULT ''::text,
    display_name_zh text DEFAULT ''::text,
    power_kw double precision NOT NULL,
    price_usd double precision NOT NULL,
    voltage_levels jsonb DEFAULT '[]'::jsonb,
    packs_per_inverter integer DEFAULT 6,
    description text DEFAULT ''::text
);


ALTER TABLE public.inverters OWNER TO microgrid;

--
-- Name: pv_panels; Type: TABLE; Schema: public; Owner: microgrid
--

CREATE TABLE public.pv_panels (
    model text NOT NULL,
    display_name text NOT NULL,
    display_name_en text DEFAULT ''::text,
    display_name_zh text DEFAULT ''::text,
    watts double precision NOT NULL,
    price_usd_per_wp double precision NOT NULL,
    efficiency_pct double precision DEFAULT 20.0,
    temp_coeff_pct_per_c double precision DEFAULT '-0.35'::numeric,
    length_mm double precision DEFAULT 0,
    width_mm double precision DEFAULT 0,
    description text DEFAULT ''::text
);


ALTER TABLE public.pv_panels OWNER TO microgrid;

--
-- Name: standard_packages; Type: TABLE; Schema: public; Owner: microgrid
--

CREATE TABLE public.standard_packages (
    package_id text NOT NULL,
    data_json jsonb NOT NULL
);


ALTER TABLE public.standard_packages OWNER TO microgrid;

--
-- Data for Name: battery_packs; Type: TABLE DATA; Schema: public; Owner: microgrid
--

COPY public.battery_packs (model, display_name, display_name_en, display_name_zh, capacity_kwh, price_usd, voltage_v, cycle_life, depth_of_discharge_pct, description) FROM stdin;
LFP-5kWh	5kWh LFP Battery Pack	5kWh LFP Battery Pack	5kWh 磷酸铁锂电池包	5	1600	48	3500	90	
LFP-8kWh	8kWh LFP Battery Pack	8kWh LFP Battery Pack	8kWh 磷酸铁锂电池包	8	2100	51.2	4000	90	
LFP-10kWh	10kWh LFP Battery Pack	10kWh LFP Battery Pack	10kWh 磷酸铁锂电池包	10	2500	51.2	4000	90	
LFP-12kWh	12kWh LFP Battery Pack	12kWh LFP Battery Pack	12kWh 磷酸铁锂电池包	12	2850	51.2	5000	90	
LFP-15kWh	15kWh LFP Battery Pack	15kWh LFP Battery Pack	15kWh 磷酸铁锂电池包	15	3050	51.2	6000	90	
LFP-16kWh	16kWh Standard Battery Pack	16kWh Standard Battery Pack	16kWh 标准电池包	16	3100	51.2	6000	90	Default standard battery module for routine project sizing.
LFP-20kWh	20kWh Battery Pack	20kWh Battery Pack	20kWh 电池包	20	6000	51.2	4000	90	
LFP-25kWh	25kWh High-Capacity Battery Pack	25kWh High-Capacity Battery Pack	25kWh 高容量电池包	25	7250	51.2	6000	90	
LFP-30kWh	30kWh Commercial Battery Pack	30kWh Commercial Battery Pack	30kWh 商业电池包	30	8400	51.2	6000	90	
LFP-40kWh	40kWh Large-Cabinet Battery Pack	40kWh Large-Cabinet Battery Pack	40kWh 大柜电池包	40	11200	51.2	6000	90	
LFP-50kWh	50kWh Extra-Large Battery Pack	50kWh Extra-Large Battery Pack	50kWh 超大电池包	50	13500	51.2	6000	90	
LFP-100kWh	100kWh Containerized Storage Cabinet	100kWh Containerized Storage Cabinet	100kWh 集装箱储能柜	100	25500	512	6000	90	
LFP-120kWh	120kWh Commercial Storage Cabinet	120kWh Commercial Storage Cabinet	120kWh 商业储能柜	120	29400	512	6000	90	
LFP-215kWh	215kWh Commercial Storage Cabinet	215kWh Commercial Storage Cabinet	215kWh 商业储能柜	215	49450	768	6000	90	
LFP-261kWh	261kWh Liquid-Cooled Storage Cabinet	261kWh Liquid-Cooled Storage Cabinet	261kWh 液冷储能柜	261	57420	768	7000	92	
\.


--
-- Data for Name: bracket_systems; Type: TABLE DATA; Schema: public; Owner: microgrid
--

COPY public.bracket_systems (model, display_name, display_name_en, display_name_zh, panels_per_set, area_m2, footprint_length_m, footprint_width_m, description) FROM stdin;
compact_16	Compact Folding Bracket 16-panel Set	Compact Folding Bracket 16-panel Set	紧凑折叠支架 16块/套	16	78.4	14	5.6	Fits narrow sites, rooftops, and projects with limited usable area.
compact_24	Compact Folding Bracket 24-panel Set	Compact Folding Bracket 24-panel Set	紧凑折叠支架 24块/套	24	117.6	21	5.6	Compact layout option for small and medium projects.
standard_32	Standard Folding Bracket 32-panel Set	Standard Folding Bracket 32-panel Set	标准折叠支架 32块/套	32	156.8	28	5.6	Default folding bracket for most ground-mounted microgrid projects.
standard_36	Standard Folding Bracket 36-panel Set	Standard Folding Bracket 36-panel Set	标准折叠支架 36块/套	36	176.4	31.5	5.6	Higher-density standard option balancing transport and footprint.
large_48	Large Folding Bracket 48-panel Set	Large Folding Bracket 48-panel Set	大型折叠支架 48块/套	48	235.2	42	5.6	Suitable for commercial and industrial open land.
utility_64	Utility Folding Bracket 64-panel Set	Utility Folding Bracket 64-panel Set	超大折叠支架 64块/套	64	313.6	56	5.6	Suitable for large ground-mounted projects and centralized microgrid sites.
\.


--
-- Data for Name: catalog_blobs; Type: TABLE DATA; Schema: public; Owner: microgrid
--

COPY public.catalog_blobs (key, json_value) FROM stdin;
pricing	{"profit_margin": 0.2, "pass_through_items": ["diesel_generator_cost", "installation_cost"]}
home_bg_defaults	{"pv_kw": 83.8, "diesel_kw": 40, "battery_kwh": 256, "storage_days": 1, "annual_load_kwh": 131400, "diesel_price_usd": 0.95}
site_layout	{"tray_width_m": 4.4, "tray_length_m": 6.2, "inverters_per_tray": 2, "max_layout_area_m2": 40000, "diesel_reserved_area_m2": 75}
simulation_defaults	{"default_year": 2020, "default_load_type": "residential", "system_efficiency": 0.78, "diesel_dispatch_mode": "cc", "converter_kw_per_pv_kw": 0.5, "cycle_charging_start_soc_pu": 0.42, "cycle_charging_target_load_pu": 0.58, "pv_generation_correction_factor": 1.04}
accessories	{"ems_addons": {"prediction_control_usd": 5000}, "installation": {"base_usd": 1000, "per_bracket_set_usd": 1000}, "battery_pallet": {"per_pack_usd": 250, "reference_pack_kwh": 10}, "intl_transport": {"base_usd": 3000, "per_bracket_set_usd": 1950}, "other_initial_usd": 4200, "accessory_materials": {"base_usd": 8500, "per_bracket_set_usd": 5000}, "pv_mounting_cost_per_set_usd": 19050}
\.


--
-- Data for Name: catalog_meta; Type: TABLE DATA; Schema: public; Owner: microgrid
--

COPY public.catalog_meta (key, value_json) FROM stdin;
pv_panels.default_model	"655W"
bracket_systems.default_model	"standard_32"
bracket_systems.spacing_m	3.048
battery_packs.default_model	"LFP-16kWh"
battery_packs.price_usd_per_kwh_fallback	300.0
inverters.voltage_default_map	{"120V/208V": "INV-10000W-208V", "120V/240V": "INV-5000W-240V", "220V/380V": "INV-15000W-480V", "230V/400V": "INV-15000W-480V", "277V/480V": "INV-15000W-480V"}
diesel_generators.price_usd_per_kw	1125.0
economic_defaults	{"project_years": 25, "inflation_rate_pct": 2, "nominal_discount_rate_pct": 10, "diesel_price_usd_per_liter": 1.0, "capex_bos_calibration_factor": 1.42, "fuel_cost_calibration_factor": 1.1, "electricity_price_usd_per_kwh": 0.35, "capex_equipment_calibration_factor": 1.22}
\.


--
-- Data for Name: diesel_generators; Type: TABLE DATA; Schema: public; Owner: microgrid
--

COPY public.diesel_generators (model, display_name, display_name_en, display_name_zh, power_kw, price_usd, fuel_efficiency_kwh_per_liter, description, fuel_intercept_coeff, fuel_slope_coeff) FROM stdin;
DG-10kW	10kW Diesel Generator	10kW Diesel Generator	10kW 柴油发电机	10	12000	3.2		0.033	0.273
DG-15kW	15kW Diesel Generator	15kW Diesel Generator	15kW 柴油发电机	15	17500	3.3		0.033	0.273
DG-17kW	17kW Diesel Generator	17kW Diesel Generator	17kW 柴油发电机	17	19125	3.4		0.033	0.273
DG-20kW	20kW Diesel Generator	20kW Diesel Generator	20kW 柴油发电机	20	22500	3.5		0.033	0.273
DG-25kW	25kW Diesel Generator	25kW Diesel Generator	25kW 柴油发电机	25	28000	3.5		0.033	0.273
DG-30kW	30kW Diesel Generator	30kW Diesel Generator	30kW 柴油发电机	30	33500	3.5		0.033	0.224
DG-40kW	40kW Diesel Generator	40kW Diesel Generator	40kW 柴油发电机	40	45000	3.5		0.033	0.273
DG-50kW	50kW Diesel Generator	50kW Diesel Generator	50kW 柴油发电机	50	56000	3.55		0.033	0.273
DG-60kW	60kW Diesel Generator	60kW Diesel Generator	60kW 柴油发电机	60	67500	3.6		0.033	0.273
DG-80kW	80kW Diesel Generator	80kW Diesel Generator	80kW 柴油发电机	80	90000	3.7		0.033	0.273
DG-100kW	100kW Diesel Generator	100kW Diesel Generator	100kW 柴油发电机	100	112500	3.8		0.033	0.273
DG-120kW	120kW Diesel Generator	120kW Diesel Generator	120kW 柴油发电机	120	132000	3.85		0.033	0.273
DG-150kW	150kW Diesel Generator	150kW Diesel Generator	150kW 柴油发电机	150	165000	3.9		0.033	0.273
DG-200kW	200kW Diesel Generator	200kW Diesel Generator	200kW 柴油发电机	200	220000	4		0.033	0.273
DG-250kW	250kW Diesel Generator	250kW Diesel Generator	250kW 柴油发电机	250	273000	4.05		0.033	0.273
DG-300kW	300kW Industrial Diesel Generator	300kW Industrial Diesel Generator	300kW 工业柴油发电机	300	324000	4.1		0.033	0.273
DG-400kW	400kW Industrial Diesel Generator	400kW Industrial Diesel Generator	400kW 工业柴油发电机	400	420000	4.15		0.033	0.273
DG-500kW	500kW Industrial Diesel Generator	500kW Industrial Diesel Generator	500kW 工业柴油发电机	500	515000	4.2		0.033	0.273
\.


--
-- Data for Name: integrated_pv_storage; Type: TABLE DATA; Schema: public; Owner: microgrid
--

COPY public.integrated_pv_storage (model, display_name, display_name_en, display_name_zh, pv_kw, battery_kwh, battery_kw, diesel_ratio) FROM stdin;
small	Small PV-Storage Unit	Small PV-Storage Unit	小型光储一体机	5	10	5	0.5
medium	Medium PV-Storage Unit	Medium PV-Storage Unit	中型光储一体机	10	20	10	1
large	Large PV-Storage Unit	Large PV-Storage Unit	大型光储一体机	20	40	20	2
xlarge	Extra-Large PV-Storage Unit	Extra-Large PV-Storage Unit	超大型光储一体机	30	60	30	2.5
\.


--
-- Data for Name: inverters; Type: TABLE DATA; Schema: public; Owner: microgrid
--

COPY public.inverters (model, display_name, display_name_en, display_name_zh, power_kw, price_usd, voltage_levels, packs_per_inverter, description) FROM stdin;
INV-3000W-240V	3kW Bidirectional Inverter 120/240V	3kW Bidirectional Inverter 120/240V	3kW 双向逆变器 120/240V	3	4200	["120V/240V"]	4	Suitable for small residential and light-load systems.
INV-5000W-240V	5kW Bidirectional Inverter 120/240V	5kW Bidirectional Inverter 120/240V	5kW 双向逆变器 120/240V	18	7500	["120V/240V"]	6	Default residential inverter.
INV-6000W-240V	6kW Bidirectional Inverter 120/240V	6kW Bidirectional Inverter 120/240V	6kW 双向逆变器 120/240V	6	7900	["120V/240V"]	6	Suitable for residential sites with slightly higher peak load.
INV-7500W-208V	7.5kW Three-Phase Inverter 120/208V	7.5kW Three-Phase Inverter 120/208V	7.5kW 三相逆变器 120/208V	7.5	7500	["120V/208V"]	6	Suitable for light commercial three-phase applications.
INV-10000W-208V	10kW Three-Phase Inverter 120/208V	10kW Three-Phase Inverter 120/208V	10kW 三相逆变器 120/208V	10	9800	["120V/208V"]	8	Suitable for retail, restaurant, and light industrial loads.
INV-12000W-480V	12kW Industrial Inverter 277/480V	12kW Industrial Inverter 277/480V	12kW 工业逆变器 277/480V	12	12800	["277V/480V"]	8	Suitable for medium industrial and facility applications.
INV-15000W-480V	15kW Industrial Inverter 277/480V	15kW Industrial Inverter 277/480V	15kW 工业逆变器 277/480V	15	15000	["220V/380V", "230V/400V", "277V/480V"]	8	Default industrial inverter.
INV-20000W-480V	20kW Industrial Inverter 277/480V	20kW Industrial Inverter 277/480V	20kW 工业逆变器 277/480V	20	18800	["277V/480V"]	10	Suitable for larger industrial and off-grid systems.
INV-50000W-480V	50kW Commercial PCS 277/480V	50kW Commercial PCS 277/480V	50kW 商业PCS 277/480V	50	39800	["277V/480V"]	16	Suitable for project-scale commercial storage systems.
INV-100000W-480V	100kW Storage Converter 277/480V	100kW Storage Converter 277/480V	100kW 储能变流器 277/480V	100	73500	["277V/480V"]	24	Suitable for large microgrids and campus-scale projects.
\.


--
-- Data for Name: pv_panels; Type: TABLE DATA; Schema: public; Owner: microgrid
--

COPY public.pv_panels (model, display_name, display_name_en, display_name_zh, watts, price_usd_per_wp, efficiency_pct, temp_coeff_pct_per_c, length_mm, width_mm, description) FROM stdin;
430W	430W Mono Commercial Module	430W Mono Commercial Module	430W 单晶商用组件	430	0.29	21	-0.35	1722	1134	Entry-level module for small commercial rooftops and distributed PV projects.
460W	460W Mono High-Density Module	460W Mono High-Density Module	460W 高密度单晶组件	460	0.3	21.2	-0.34	1903	1134	Suitable for small and medium rooftops and light ground-mount projects.
500W	500W Mono Utility Module	500W Mono Utility Module	500W 单晶实用组件	500	0.3	21.5	-0.34	2094	1134	Engineering-grade module with balanced cost and logistics efficiency.
550W	550W Mono Standard Module	550W Mono Standard Module	550W 单晶标准组件	550	0.29	20	-0.35	2187	1102	Mainstream option for cost-sensitive projects.
580W	580W Mono Mainstream Module	580W Mono Mainstream Module	580W 主流单晶组件	580	0.3	20.9	-0.34	2278	1134	Common power class for microgrid and ground-mounted systems.
600W	600W Mono Large-Format Module	600W Mono Large-Format Module	600W 大幅面单晶组件	600	0.3	20.5	-0.34	2278	1134	Standard large-format module for commercial and industrial ground systems.
620W	620W Bifacial Mono Module	620W Bifacial Mono Module	620W 双面单晶组件	620	0.31	21	-0.34	2382	1134	Bifacial module for projects targeting higher annual yield.
655W	655W High-Efficiency PERC Module	655W High-Efficiency PERC Module	655W 高效PERC组件	655	0.32	21.3	-0.34	2384	1096	Default baseline module with balanced efficiency, price, and supply stability.
670W	670W TOPCon N-Type Module	670W TOPCon N-Type Module	670W TOPCon N型组件	670	0.33	21.7	-0.3	2384	1134	For projects prioritizing energy yield per unit area.
700W	700W TOPCon Bifacial Module	700W TOPCon Bifacial Module	700W TOPCon 双面组件	700	0.35	22.5	-0.29	2384	1303	For premium commercial, industrial, and utility applications.
710W	710W Ultra-High-Efficiency TOPCon Module	710W Ultra-High-Efficiency TOPCon Module	710W 超高效TOPCon组件	710	0.36	22.8	-0.29	2384	1134	For projects with limited installation count but high capacity density targets.
720W	720W TOPCon Flagship Module	720W TOPCon Flagship Module	720W TOPCon 旗舰组件	720	0.37	22.9	-0.29	2384	1303	Premium choice for maximizing installed capacity on constrained sites.
\.


--
-- Data for Name: standard_packages; Type: TABLE DATA; Schema: public; Owner: microgrid
--

COPY public.standard_packages (package_id, data_json) FROM stdin;
small	{"load_type": "industrial", "panel_model": "655W", "bracket_sets": 4, "diesel_model": "DG-20kW", "display_name": "Small PV-Storage-Diesel", "peak_load_kw": 50, "bracket_model": "standard_32", "annual_load_kwh": 131400, "display_name_en": "Small PV-Storage-Diesel", "display_name_zh": "小型光储柴一体", "battery_pack_count": 16, "battery_pack_model": "LFP-16kWh"}
medium	{"load_type": "industrial", "panel_model": "655W", "bracket_sets": 8, "diesel_model": "DG-80kW", "display_name": "Medium PV-Storage-Diesel", "peak_load_kw": 100, "bracket_model": "standard_32", "annual_load_kwh": 262800, "display_name_en": "Medium PV-Storage-Diesel", "display_name_zh": "中型光储柴一体", "battery_pack_count": 32, "battery_pack_model": "LFP-16kWh"}
large	{"load_type": "industrial", "panel_model": "655W", "bracket_sets": 16, "diesel_model": "DG-150kW", "display_name": "Large PV-Storage-Diesel", "peak_load_kw": 200, "bracket_model": "standard_32", "annual_load_kwh": 525600, "display_name_en": "Large PV-Storage-Diesel", "display_name_zh": "大型光储柴一体", "battery_pack_count": 64, "battery_pack_model": "LFP-16kWh"}
\.


--
-- Name: battery_packs battery_packs_pkey; Type: CONSTRAINT; Schema: public; Owner: microgrid
--

ALTER TABLE ONLY public.battery_packs
    ADD CONSTRAINT battery_packs_pkey PRIMARY KEY (model);


--
-- Name: bracket_systems bracket_systems_pkey; Type: CONSTRAINT; Schema: public; Owner: microgrid
--

ALTER TABLE ONLY public.bracket_systems
    ADD CONSTRAINT bracket_systems_pkey PRIMARY KEY (model);


--
-- Name: catalog_blobs catalog_blobs_pkey; Type: CONSTRAINT; Schema: public; Owner: microgrid
--

ALTER TABLE ONLY public.catalog_blobs
    ADD CONSTRAINT catalog_blobs_pkey PRIMARY KEY (key);


--
-- Name: catalog_meta catalog_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: microgrid
--

ALTER TABLE ONLY public.catalog_meta
    ADD CONSTRAINT catalog_meta_pkey PRIMARY KEY (key);


--
-- Name: diesel_generators diesel_generators_pkey; Type: CONSTRAINT; Schema: public; Owner: microgrid
--

ALTER TABLE ONLY public.diesel_generators
    ADD CONSTRAINT diesel_generators_pkey PRIMARY KEY (model);


--
-- Name: integrated_pv_storage integrated_pv_storage_pkey; Type: CONSTRAINT; Schema: public; Owner: microgrid
--

ALTER TABLE ONLY public.integrated_pv_storage
    ADD CONSTRAINT integrated_pv_storage_pkey PRIMARY KEY (model);


--
-- Name: inverters inverters_pkey; Type: CONSTRAINT; Schema: public; Owner: microgrid
--

ALTER TABLE ONLY public.inverters
    ADD CONSTRAINT inverters_pkey PRIMARY KEY (model);


--
-- Name: pv_panels pv_panels_pkey; Type: CONSTRAINT; Schema: public; Owner: microgrid
--

ALTER TABLE ONLY public.pv_panels
    ADD CONSTRAINT pv_panels_pkey PRIMARY KEY (model);


--
-- Name: standard_packages standard_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: microgrid
--

ALTER TABLE ONLY public.standard_packages
    ADD CONSTRAINT standard_packages_pkey PRIMARY KEY (package_id);


--
-- PostgreSQL database dump complete
--

\unrestrict C4jZIdIXPQgYsACVhc8FB9RryAdu7yKeAn8dpVarqAOhOB8r5HswWgIeJwhUJ3K

