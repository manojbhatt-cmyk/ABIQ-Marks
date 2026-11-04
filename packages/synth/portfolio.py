"""The synthetic portfolio (Transorg Data Spec.md section 7).

22 borrowers, 26 facilities (24 in scope: 20 term loans, 2 DDTL, 2 second-lien term
loans; 2 revolvers out of scope), 8 sponsors, 6 deal teams. Maple, Harbor and
Sunrise carry the worked example numbers exactly (section 7.2). The other 21 loans are
set so their value deltas net to zero at every checkpoint (Lincoln v1, after G1,
after committee), so the portfolio change equals the three-loan change (-3.95, -3.05,
-3.175). Team Grey approves 0.5 below Lincoln's range (agenda test 4 fires); Team
Violet's Atlas approves inside the range above the point by exactly the offsetting
amount (recorded as a decision in the tracker).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

PERIOD = "2026-Q3"
PREV_PERIOD = "2026-Q2"
DAY0 = date(2026, 9, 30)
MONTHLY_PERIOD = "2026-10"
DOMAIN = "ab-poc.local"

SPONSORS = [
    ("SP-001", "Northgate Capital", "deals@northgatecap.example"),
    ("SP-002", "Harborview Equity Partners", "ops@harborviewep.example"),
    ("SP-003", "Crestline Partners", "portfolio@crestline.example"),
    ("SP-004", "Ridgeway Capital", "finance@ridgewaycap.example"),
    ("SP-005", "Bluestem Equity", "pm@bluestem.example"),
    ("SP-006", "Lakeshore Growth", "deals@lakeshoregrowth.example"),
    ("SP-007", "Summit Rock Partners", "ops@summitrock.example"),
    ("SP-008", "Evergreen Buyout Fund", "cfo@evergreenbuyout.example"),
]

TEAMS = [
    ("DT-RED", "Team Red"), ("DT-BLUE", "Team Blue"), ("DT-GREEN", "Team Green"),
    ("DT-AMBER", "Team Amber"), ("DT-GREY", "Team Grey"), ("DT-VIOLET", "Team Violet"),
]

# Funds from the client CMR "Holdings" table.
FUNDS = [("MMDLF1", "Middle Market Direct Lending Fund I", "fund"),
         ("MMDLF2", "Middle Market Direct Lending Fund II", "fund"),
         ("BDC", "AB Private Credit BDC", "bdc"), ("LUX1", "AB PC Lux I", "fund"),
         ("PCIPAC", "PCI Pacific", "sma"), ("ABLEND", "AB Lend", "fund"),
         ("MMDLF4", "Middle Market Direct Lending Fund IV", "fund"), ("ABPCI", "AB-PCI Investors", "fund")]

RATING_LABELS = {1: "(1) - Performing / On-Track", 2: "(2) - Performing / Minor Variance",
                 3: "(3) - Underperforming / Monitor", 4: "(4) - Watchlist / Elevated Risk",
                 5: "(5) - Substandard / Covenant Breach", 6: "(6) - Non-Accrual / Impaired"}


@dataclass
class User:
    email: str
    name: str
    role: str
    team: str | None = None


def users() -> list[User]:
    out = [User(f"pm.analyst@{DOMAIN}", "Priya Menon", "pm_team"),
           User(f"pm.lead@{DOMAIN}", "Daniel Okafor", "pm_team")]
    first = {"RED": ("Rhea Patel", "Marcus Lee"), "BLUE": ("Ben Carter", "Alicia Gomez"),
             "GREEN": ("Grace Kim", "Tom Fischer"), "AMBER": ("Anika Rao", "Liam Walsh"),
             "GREY": ("Gavin Shaw", "Nora Haddad"), "VIOLET": ("Vera Ivanova", "Sam Ortiz")}
    for team_id, _ in TEAMS:
        k = team_id.split("-")[1]
        lead, analyst = first[k]
        out.append(User(f"team.{k.lower()}.lead@{DOMAIN}", lead, "deal_lead", team_id))
        out.append(User(f"team.{k.lower()}.analyst@{DOMAIN}", analyst, "deal_analyst", team_id))
    out += [User(f"acm.one@{DOMAIN}", "Helen Brooks", "ac_manager"),
            User(f"acm.two@{DOMAIN}", "Omar Siddiqui", "ac_manager"),
            User(f"sct.reviewer@{DOMAIN}", "Catherine Doyle", "sct"),
            User("analyst@lincoln.example", "Lincoln Valuation Team", "lincoln"),
            User(f"vc.member1@{DOMAIN}", "Robert Hayes", "committee_member"),
            User(f"vc.member2@{DOMAIN}", "Mei Tanaka", "committee_member"),
            User(f"vc.chair@{DOMAIN}", "Elizabeth Warren-Price", "committee_chair"),
            User(f"governance@{DOMAIN}", "Governance Panel", "governance"),
            User(f"wes.finance@{DOMAIN}", "Wes Turner", "finance_ir"),
            User(f"justin.finance@{DOMAIN}", "Justin Park", "finance_ir"),
            User(f"ir@{DOMAIN}", "Investor Relations", "finance_ir"),
            User(f"admin@{DOMAIN}", "TransOrg Admin", "admin")]
    return out


@dataclass
class Facility:
    facility_id: str
    ftype: str  # term_loan, ddtl, revolver, second_lien
    commitment: float
    funded: float
    coupon: float
    maturity: date
    prev_mark: float
    lincoln_point: float
    range_half: float = 1.5
    required_yield: float | None = None
    g1_mark: float | None = None  # None = approve at Lincoln point
    g1_rationale: str | None = None
    in_scope: bool = True
    cmr_type: str = "standard"
    covenant: tuple[str, str, float] = ("max_leverage", "<", 4.50)


@dataclass
class Borrower:
    borrower_id: str
    name: str
    legal: str
    team: str
    sector: str
    sct_category: str
    agenda: str  # SCT session from the Master Agenda
    sponsor: str
    slug: str
    description: str
    facilities: list[Facility]
    rating: int = 2
    watchlist: bool = False
    family: str = "B"  # package format family A xlsx, B pdf, C scanned
    arrival_day: int = 6
    missing_until_chased: list[str] = field(default_factory=list)
    fin: dict = field(default_factory=dict)  # quarterly financials, see financials()
    fye: str = "Dec"
    q_days: int = 45

    @property
    def domain(self) -> str:
        return f"{self.slug.replace('-', '')}.example"


def _f(fid, ftype, commit, funded, coupon, mat, prev, point, **kw):
    return Facility(fid, ftype, commit, funded, coupon, mat, prev, point, **kw)


def borrowers() -> list[Borrower]:
    b = [
        Borrower("B-0001", "Maple Dental", "Maple Dental Partners LLC", "DT-RED", "Healthcare & HCIT", "R2 - dental",
                 "Healthcare", "SP-003", "maple-dental",
                 "Dental service organisation operating 84 practices across the Midwest.",
                 [_f("F-0001", "term_loan", 40, 40, 0.090, date(2030, 6, 30), 99.0, 99.25, range_half=0.5,
                     required_yield=0.0925, covenant=("max_leverage", "<", 4.00))],
                 rating=2, family="A", arrival_day=5),
        Borrower("B-0002", "Harbor Logistics", "Harbor Logistics Holdings Inc.", "DT-BLUE", "Transport & Logistics",
                 "Business Services - transport", "Services", "SP-001", "harbor-logistics",
                 "Asset-based regional trucking and freight logistics provider operating 180 trucks.",
                 [_f("F-0002", "term_loan", 60, 60, 0.103, date(2029, 9, 30), 97.0, 86.5, range_half=1.5,
                     required_yield=0.165, cmr_type="watchlist", covenant=("max_leverage", "<", 3.50))],
                 rating=3, family="B", arrival_day=6),
        Borrower("B-0003", "Sunrise Foods", "Sunrise Foods Group Inc.", "DT-GREEN", "Consumer Non-Cyclical",
                 "R1 - Multi", "Services", "SP-002", "sunrise-foods",
                 "Producer of private-label frozen breakfast foods for grocery retailers.",
                 [_f("F-0003", "term_loan", 25, 25, 0.110, date(2029, 3, 31), 80.0, 89.0, range_half=1.5,
                     required_yield=0.142, cmr_type="watchlist", covenant=("max_leverage", "<", 4.50))],
                 rating=5, watchlist=True, family="B", arrival_day=7),
        Borrower("B-0004", "Northwind Fiber", "Northwind Fiber Networks LLC", "DT-VIOLET",
                 "Digital Infrastructure & Services", "DIS - fiber", "DIS #1", "SP-004", "northwind-fiber",
                 "Provides fiber, data center colocation services and other communication services to commercial customers.",
                 [_f("F-0004", "term_loan", 45, 45, 0.0975, date(2030, 3, 31), 98.5, 98.5),
                  _f("F-0005", "ddtl", 20, 12, 0.0975, date(2030, 3, 31), 98.5, 98.5)], family="B", arrival_day=4),
        Borrower("B-0005", "Cedar Ridge Health", "Cedar Ridge Health Services Inc.", "DT-AMBER", "Healthcare & HCIT",
                 "R2 - RCM", "Healthcare", "SP-005", "cedar-ridge-health",
                 "Revenue cycle management services for regional hospital systems.",
                 [_f("F-0006", "term_loan", 35, 35, 0.0975, date(2030, 12, 31), 97.0, 96.75),
                  _f("F-0007", "revolver", 10, 3, 0.0950, date(2029, 12, 31), 100.0, 100.0, in_scope=False)],
                 family="A", arrival_day=5),
        Borrower("B-0006", "Atlas Ledger Software", "Atlas Ledger Software Inc.", "DT-VIOLET",
                 "Software & Tech Services", "R5", "SW - Person 27", "SP-006", "atlas-ledger",
                 "Vertical accounting software for mid-market construction firms.",
                 [_f("F-0008", "term_loan", 50, 50, 0.1050, date(2031, 6, 30), 97.0, 97.0,
                     g1_mark=98.2, g1_rationale="Recent repricing and 101 soft call protection support a mark "
                     "above Lincoln's point; inside Lincoln's range.", range_half=1.5),
                  _f("F-0009", "second_lien", 15, 15, 0.1300, date(2031, 12, 31), 94.0, 94.0, range_half=2.0)],
                 family="B", arrival_day=6),
        Borrower("B-0007", "Pinecrest Security", "Pinecrest Security Monitoring LLC", "DT-RED", "Specialty RMR",
                 "KA", "Services", "SP-007", "pinecrest-security",
                 "Recurring monthly revenue alarm monitoring for residential and commercial customers.",
                 [_f("F-0010", "term_loan", 30, 30, 0.1000, date(2030, 9, 30), 98.0, 98.25),
                  _f("F-0011", "revolver", 8, 2, 0.0950, date(2029, 9, 30), 100.0, 100.0, in_scope=False)],
                 family="A", arrival_day=4),
        Borrower("B-0008", "Bluewater Data Centers", "Bluewater Data Centers LLC", "DT-VIOLET",
                 "Digital Infrastructure & Services", "DIS - data center", "DIS #2", "SP-004", "bluewater-dc",
                 "Edge data center operator with six facilities in secondary markets.",
                 [_f("F-0012", "ddtl", 25, 15, 0.0950, date(2031, 3, 31), 99.0, 99.0)], family="B", arrival_day=5),
        Borrower("B-0009", "Orchard Home Health", "Orchard Home Health Inc.", "DT-AMBER", "Healthcare & HCIT",
                 "R2 - home health", "Healthcare", "SP-005", "orchard-home-health",
                 "Home health and hospice provider across four states.",
                 [_f("F-0013", "term_loan", 28, 28, 0.1150, date(2029, 6, 30), 92.0, 92.0, cmr_type="watchlist",
                     covenant=("max_leverage", "<", 5.50))], rating=4, watchlist=True, family="B", arrival_day=6),
        Borrower("B-0010", "Granite Payroll", "Granite Payroll Systems Inc.", "DT-GREY", "Software & Tech Services",
                 "R5", "SW - Person 80", "SP-006", "granite-payroll",
                 "Payroll and HR software for small businesses.",
                 [_f("F-0014", "term_loan", 40, 40, 0.1025, date(2031, 3, 31), 98.0, 98.0, range_half=1.0,
                     g1_mark=96.5, g1_rationale="Deal Team view: churn in the SMB book and the delayed product "
                     "release justify a mark below Lincoln's range.")], family="A", arrival_day=5),
        Borrower("B-0011", "Kestrel Managed IT", "Kestrel Managed IT Services LLC", "DT-GREY",
                 "Digital Infrastructure & Services", "DIS - managed services", "DIS #2", "SP-007", "kestrel-it",
                 "Managed IT and cybersecurity services for mid-sized enterprises.",
                 [_f("F-0015", "term_loan", 33, 33, 0.0975, date(2030, 6, 30), 99.5, 99.5)], family="B", arrival_day=6),
        Borrower("B-0012", "Summit PPM Partners", "Summit Physician Practice Management LLC", "DT-GREEN",
                 "Healthcare & HCIT", "R3 - PPM", "Healthcare", "SP-008", "summit-ppm",
                 "Physician practice management for orthopaedic groups.",
                 [_f("F-0016", "term_loan", 27, 27, 0.1000, date(2030, 3, 31), 97.5, 97.5)],
                 family="B", arrival_day=12, q_days=60),
        Borrower("B-0013", "Lumen Field Services", "Lumen Field Services Inc.", "DT-RED", "Services",
                 "Business Services", "Services", "SP-003", "lumen-field",
                 "Outsourced field maintenance services for utilities.",
                 [_f("F-0017", "term_loan", 30, 30, 0.1050, date(2029, 12, 31), 96.0, 95.75)],
                 family="B", arrival_day=7, missing_until_chased=["covenant_certificate"]),
        Borrower("B-0014", "Redwood Franchise Brands", "Redwood Franchise Brands LLC", "DT-GREEN",
                 "Consumer Non-Cyclical", "R1 - Franchisor", "Services", "SP-002", "redwood-franchise",
                 "Franchisor of quick-service bakery cafes with 410 units.",
                 [_f("F-0018", "term_loan", 31, 31, 0.0950, date(2030, 9, 30), 98.75, 98.75)], family="A", arrival_day=5),
        Borrower("B-0015", "Vantage Insurance Services", "Vantage Insurance Services LLC", "DT-BLUE", "Financials",
                 "Financial", "Services", "SP-008", "vantage-insurance",
                 "Insurance claims administration and brokerage services.",
                 [_f("F-0019", "term_loan", 35, 35, 0.0925, date(2030, 12, 31), 99.0, 99.25)], family="B", arrival_day=6),
        Borrower("B-0016", "Copperline Fiber", "Copperline Fiber Holdings LLC", "DT-VIOLET",
                 "Digital Infrastructure & Services", "DIS - fiber", "DIS #1", "SP-004", "copperline-fiber",
                 "Rural fiber-to-the-home network operator.",
                 [_f("F-0020", "second_lien", 18, 18, 0.1250, date(2031, 6, 30), 93.0, 93.0, range_half=2.0)],
                 family="B", arrival_day=7),
        Borrower("B-0017", "Meridian Clinical IT", "Meridian Clinical IT Inc.", "DT-AMBER", "Healthcare & HCIT",
                 "R2 - HCIT", "Healthcare", "SP-005", "meridian-clinical",
                 "Clinical documentation software for hospital systems.",
                 [_f("F-0021", "term_loan", 36, 36, 0.1000, date(2031, 3, 31), 98.0, 98.0)], family="B", arrival_day=10),
        Borrower("B-0018", "Silverleaf Analytics", "Silverleaf Analytics Inc.", "DT-GREY", "Software & Tech Services",
                 "R5", "SW - Person 81", "SP-006", "silverleaf-analytics",
                 "Retail analytics SaaS for consumer brands.",
                 [_f("F-0022", "term_loan", 29, 29, 0.1025, date(2031, 9, 30), 99.25, 99.25)], family="C", arrival_day=6),
        Borrower("B-0019", "Trailhead Freight", "Trailhead Freight Brokerage LLC", "DT-BLUE", "Transport & Logistics",
                 "Business Services - Logistics", "Services", "SP-001", "trailhead-freight",
                 "Asset-light freight brokerage for temperature-controlled loads.",
                 [_f("F-0023", "term_loan", 26, 26, 0.1100, date(2029, 12, 31), 95.0, 95.0)], family="B", arrival_day=11),
        Borrower("B-0020", "Brightpath Dental Labs", "Brightpath Dental Laboratories Inc.", "DT-RED",
                 "Healthcare & HCIT", "R2 - dental", "Healthcare", "SP-003", "brightpath-dental",
                 "Dental prosthetics laboratory network.",
                 [_f("F-0024", "term_loan", 23, 23, 0.1000, date(2030, 6, 30), 97.0, 97.0)],
                 family="A", arrival_day=6, missing_until_chased=["covenant_certificate"]),
        Borrower("B-0021", "Quarry Point Software", "Quarry Point Software Inc.", "DT-GREY", "Software & Tech Services",
                 "R5 - GSC", "SW - Person 27", "SP-007", "quarry-point",
                 "Supply chain planning software for aggregates producers.",
                 [_f("F-0025", "term_loan", 34, 34, 0.1000, date(2031, 6, 30), 98.5, 98.5)], family="B", arrival_day=5),
        Borrower("B-0022", "Ironwood Facilities", "Ironwood Facilities Services LLC", "DT-AMBER", "Services",
                 "Business Services", "Services", "SP-008", "ironwood-facilities",
                 "Janitorial and facilities services for commercial real estate.",
                 [_f("F-0026", "term_loan", 21, 21, 0.1050, date(2030, 3, 31), 96.5, 96.5)], family="B", arrival_day=11),
    ]
    for br in b:
        br.fin = financials(br)
    return b


QUARTERS = ["2025-Q3", "2025-Q4", "2026-Q1", "2026-Q2", "2026-Q3"]
Q_LABELS = ["Q3 2025", "Q4 2025", "Q1 2026", "Q2 2026", "Q3 2026"]


def financials(br: Borrower) -> dict:
    """Quarterly statements (USD millions) used by the package generator and as ground truth."""
    if br.borrower_id == "B-0002":  # Harbor: Data Spec section 7.2, exact
        return {
            "REVENUE": [48.0, 45.5, 44.8, 44.0, 41.0],
            "COGS": [33.6, 32.4, 32.2, 32.0, 30.6],
            "OPEX": [7.2, 9.1, 8.7, 8.3, 6.3],
            "REPORTED_EBITDA": [7.2, 4.0, 3.9, 3.7, 4.1],
            "SEVERANCE": [0.0, 0.0, 0.0, 0.0, 0.3],
            "CASH": 1.4, "TOTAL_DEBT": 60.0, "INTEREST_EXPENSE_LTM": 6.2,
        }
    debt = sum(f.funded for f in br.facilities if f.in_scope) + sum(f.funded for f in br.facilities if not f.in_scope)
    target_lev = {"B-0003": 4.1, "B-0009": 5.1, "B-0001": 3.2}.get(br.borrower_id,
                                                                  3.0 + (int(br.borrower_id[-2:]) % 7) * 0.15)
    ltm = round(debt / target_lev, 1)
    q3 = round(ltm / 4 * 1.02, 2)
    seq = [round(ltm / 4 * x, 2) for x in (0.97, 0.99, 0.98, 1.01)]
    q_ebitda = [seq[0], seq[1], seq[2], seq[3], 0.0]
    q_ebitda[4] = round(ltm - sum(q_ebitda[1:4]), 2)
    margin = 0.18 + (int(br.borrower_id[-2:]) % 5) * 0.02
    rev = [round(e / margin, 1) for e in q_ebitda]
    cogs = [round(r * 0.58, 1) for r in rev]
    opex = [round(r - c - e, 1) for r, c, e in zip(rev, cogs, q_ebitda)]
    _ = q3
    return {"REVENUE": rev, "COGS": cogs, "OPEX": opex, "REPORTED_EBITDA": q_ebitda,
            "SEVERANCE": [0.0] * 5, "CASH": round(debt * 0.04, 1), "TOTAL_DEBT": round(debt, 1),
            "INTEREST_EXPENSE_LTM": round(debt * 0.098, 1)}


def ground_truth_spread(br: Borrower) -> dict:
    """Expected Q3 spread lines and metrics (generator ground truth for evals)."""
    f = br.fin
    adj = [e + s for e, s in zip(f["REPORTED_EBITDA"], f["SEVERANCE"])]
    ltm = round(sum(adj[1:]), 4)
    debt, cash, interest = f["TOTAL_DEBT"], f["CASH"], f["INTEREST_EXPENSE_LTM"]
    return {
        "REVENUE": f["REVENUE"][4], "COGS": f["COGS"][4], "OPEX": f["OPEX"][4],
        "REPORTED_EBITDA": f["REPORTED_EBITDA"][4], "ADDBACK_TOTAL": f["SEVERANCE"][4], "ADJ_EBITDA": adj[4],
        "LTM_ADJ_EBITDA": ltm, "CASH": cash, "TOTAL_DEBT": debt, "NET_DEBT": round(debt - cash, 4),
        "INTEREST_EXPENSE_LTM": interest, "LEVERAGE": round(debt / ltm, 4),
        "NET_LEVERAGE": round((debt - cash) / ltm, 4), "INTEREST_COVER": round(ltm / interest, 4),
        "REVENUE_YOY": round(f["REVENUE"][4] / f["REVENUE"][0] - 1, 4),
        "EBITDA_YOY": round(f["REPORTED_EBITDA"][4] / f["REPORTED_EBITDA"][0] - 1, 4),
    }


def all_facilities() -> list[tuple[Borrower, Facility]]:
    return [(br, f) for br in borrowers() for f in br.facilities]


def team_name(team_id: str) -> str:
    return dict(TEAMS)[team_id]


def team_emails(team_id: str) -> dict:
    k = team_id.split("-")[1].lower()
    acm = "acm.one" if team_id in ("DT-RED", "DT-BLUE", "DT-GREEN") else "acm.two"
    return {"lead": f"team.{k}.lead@{DOMAIN}", "analyst": f"team.{k}.analyst@{DOMAIN}",
            "ac_manager": f"{acm}@{DOMAIN}"}


# Lincoln v2 (Harbor only, after the send-back) - Data Spec section 3.3
HARBOR_V2 = {"point": 88.0, "low": 86.5, "high": 89.5, "yield": 0.155, "valuation_date": date(2026, 10, 29),
             "assumptions": "$5M sponsor equity committed by Northgate Capital (letter of 6 Oct); debt net of "
                            "equity $55M; net leverage 3.4x",
             "comments": "Revised after Deal Team note of 27 Oct"}
HARBOR_V1_ASSUMPTIONS = "Lost major customer; covenant breach; no sponsor support assumed"

# Committee (Q18) outcomes for the story loans; all other agenda loans are approved as proposed.
SUNRISE_COMMITTEE = {"mark": 88.5, "rationale": "Committee reduces Sunrise to 88.5: the recovery is one quarter "
                     "old and private-label pricing pressure persists; 88.5 stays inside Lincoln's range 87.5 to 90.5."}
