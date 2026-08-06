from __future__ import annotations

import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.routers.calculate import calculate
from app.schemas.calculate import CalculateRequest
from app.schemas.report import ContactInfo, SendReportRequest
from app.services.reporting.generator import _build_basic_values


def _sample_request() -> CalculateRequest:
    return CalculateRequest(
        scenario="known-load",
        bracketSets=4,
        panelModel="655W",
        batteryPackModel="LFP-10kWh",
        dieselCapacityKw=60.0,
        annualLoadKwh=131400.0,
        loadType="commercial",
        dieselPriceUsd=0.95,
        dieselDispatchMode="proxy",
        projectYears=20,
        nominalDiscountRatePct=12.0,
        inflationRatePct=3.0,
        latitude=29.86463,
        longitude=121.536405,
        year=2020,
    )


class HomerEconomicRegressionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.result = calculate(_sample_request(), simulate=False)
        assert cls.result["success"], cls.result.get("error")
        cls.summary = cls.result["summary"]
        cls.system_config = cls.result["systemConfig"]
        cls.simulation = cls.result["simulation"]

    def test_economic_controls_are_propagated(self) -> None:
        self.assertEqual(self.summary["analysisYears"], 20)
        self.assertEqual(self.system_config["projectYears"], 20)
        self.assertAlmostEqual(self.summary["nominalDiscountRatePct"], 12.0, places=2)
        self.assertAlmostEqual(self.summary["inflationRatePct"], 3.0, places=2)
        self.assertAlmostEqual(self.summary["realDiscountRatePct"], 8.74, places=2)

    def test_operating_cost_split_is_consistent(self) -> None:
        mg_total = self.summary["microgridOperatingCostUsd"]
        mg_split = (
            self.summary["mgAnnualFuelUsd"]
            + self.summary["microgridFixedOmUsd"]
            + self.summary["microgridGeneratorMaintenanceUsd"]
        )
        diesel_total = self.summary["dieselOnlyOperatingCostUsd"]
        diesel_split = (
            self.summary["dieselAnnualFuelUsd"]
            + self.summary["dieselOnlyGeneratorMaintenanceUsd"]
        )

        self.assertAlmostEqual(mg_total, mg_split, places=2)
        self.assertAlmostEqual(diesel_total, diesel_split, places=2)

    def test_npc_composition_fields_exist_and_are_bounded(self) -> None:
        self.assertGreater(self.summary["microgridCapitalNpcUsd"], 0.0)
        self.assertGreaterEqual(self.summary["microgridReplacementNpcUsd"], 0.0)
        self.assertGreaterEqual(self.summary["microgridSalvageNpcUsd"], 0.0)
        self.assertGreaterEqual(self.summary["dieselOnlyCapitalNpcUsd"], 0.0)
        self.assertGreaterEqual(self.summary["dieselOnlyReplacementNpcUsd"], 0.0)
        self.assertGreaterEqual(self.summary["dieselOnlySalvageNpcUsd"], 0.0)

        mg_structural_npc = (
            self.summary["microgridCapitalNpcUsd"]
            + self.summary["microgridReplacementNpcUsd"]
            - self.summary["microgridSalvageNpcUsd"]
        )
        diesel_structural_npc = (
            self.summary["dieselOnlyCapitalNpcUsd"]
            + self.summary["dieselOnlyReplacementNpcUsd"]
            - self.summary["dieselOnlySalvageNpcUsd"]
        )
        self.assertLessEqual(mg_structural_npc, self.summary["microgridNpcUsd"])
        self.assertLessEqual(diesel_structural_npc, self.summary["dieselOnlyNpcUsd"])

    def test_report_basic_values_include_assumptions_and_notes(self) -> None:
        report_request = SendReportRequest(
            contact=ContactInfo(
                firstName="Test",
                lastName="User",
                company="Acme",
                email="test@example.com",
                city="Ningbo",
                state="Zhejiang",
            ),
            systemConfig=self.system_config,
            summary=self.summary,
            simulation=self.simulation,
        )
        basic_values = _build_basic_values(report_request)

        self.assertEqual(basic_values["design_life_years"], 20)
        self.assertIsNotNone(basic_values["tax_basis_notes"])
        self.assertIn("Project life 20 years", basic_values["tax_basis_notes"])
        self.assertIn("Nominal discount rate 12.00%", basic_values["tax_basis_notes"])
        self.assertIn("Operating cost is annual fuel plus maintenance/O&M", basic_values["tax_basis_notes"])

        self.assertIsNotNone(basic_values["project_notes"])
        self.assertIn("MG fixed O&M", basic_values["project_notes"])
        self.assertIn("MG capital NPC", basic_values["project_notes"])


if __name__ == "__main__":
    unittest.main()
