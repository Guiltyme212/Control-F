import type { Metric, Signal, Tracker } from './types';

export const metrics: Metric[] = [
  {
    date: "2025-11-04",
    lp: "NY State CRF",
    fund: "T. Rowe Price Global Equity",
    gp: "T. Rowe Price",
    metric: "Termination",
    value: "$2,000,000,000",
    asset_class: "Public Equities",
    source: "NY_CRF_Nov_2025.pdf",
    page: 1,
    evidence: "T. Rowe Price, a global manager within the CRF public equities portfolio, was terminated. The account value at the time of termination was approximately $2 billion.",
    confidence: "high"
  },
  {
    date: "2025-11-03",
    lp: "NY State CRF",
    fund: "Stonepeak Global Renewables Fund II",
    gp: "Stonepeak Partners",
    metric: "Commitment",
    value: "$243,545,000",
    asset_class: "Real Assets",
    source: "NY_CRF_Nov_2025.pdf",
    page: 3,
    evidence: "Stonepeak Global Renewables Fund II, L.P. will focus on infrastructure assets on a global basis. Stonepeak Partners L.P. is an existing relationship with the CRF. The investment closed on November 3, 2025.",
    confidence: "high"
  },
  {
    date: "2025-11-03",
    lp: "NY State CRF",
    fund: "Stonepeak Global Renewables II Co-Invest",
    gp: "Stonepeak Partners",
    metric: "Co-Investment",
    value: "$80,000,000",
    asset_class: "Real Assets",
    source: "NY_CRF_Nov_2025.pdf",
    page: 3,
    evidence: "Stonepeak Global Renewables Fund II Co-Investment will invest alongside Stonepeak Global Renewables Fund II, L.P. The investment closed on November 3, 2025.",
    confidence: "high"
  },
  {
    date: "2025-11-18",
    lp: "NY State CRF",
    fund: "DIF Infrastructure VIII",
    gp: "CVC DIF Management",
    metric: "Commitment",
    value: "\u20AC250,000,000",
    asset_class: "Infrastructure",
    source: "NY_CRF_Nov_2025.pdf",
    page: 3,
    evidence: "DIF Infrastructure VIII is a core strategy focusing on infrastructure investments. CVC DIF Management is an existing relationship with the CRF. The investment closed on November 18, 2025.",
    confidence: "high"
  },
  {
    date: "2025-11-18",
    lp: "NY State CRF",
    fund: "DIF Value-Add IV",
    gp: "CVC DIF Management",
    metric: "Commitment",
    value: "\u20AC250,000,000",
    asset_class: "Infrastructure",
    source: "NY_CRF_Nov_2025.pdf",
    page: 3,
    evidence: "DIF Value-Add IV is a value-add strategy focusing on infrastructure investments. CVC DIF Management is an existing relationship with the CRF. The investment closed on November 18, 2025.",
    confidence: "high"
  },
  {
    date: "2025-11-15",
    lp: "NY State CRF",
    fund: "Kreos Capital VIII",
    gp: "BlackRock",
    metric: "Commitment",
    value: "$200,000,000",
    asset_class: "Credit",
    source: "NY_CRF_Nov_2025.pdf",
    page: 2,
    evidence: "Kreos Capital VIII is a Growth Debt fund which will provide private debt solutions to sponsored, pan-European and Israeli high-growth companies in Tech and Healthcare. The investment closed on November 15, 2025.",
    confidence: "high"
  },
  {
    date: "2025-11-07",
    lp: "NY State CRF",
    fund: "CVC Capital Partners Globetrotter",
    gp: "CVC Capital Partners",
    metric: "Commitment",
    value: "$13,420,000",
    asset_class: "Private Equity",
    source: "NY_CRF_Nov_2025.pdf",
    page: 1,
    evidence: "CVC will continue its investment in a portfolio company transferred out of CVC Asia Pacific Fund IV, L.P. The investment is in Asia. This investment closed on November 7, 2025.",
    confidence: "high"
  },
  {
    date: "2025-11-10",
    lp: "NY State CRF",
    fund: "Vista Equity Partners Fund IX",
    gp: "Vista Equity Partners",
    metric: "Commitment",
    value: "$300,000,000",
    asset_class: "Private Equity",
    source: "NY_CRF_Nov_2025.pdf",
    page: 2,
    evidence: "Vista Equity Partners Fund IX, L.P. is a PE buyout fund focused on enterprise software. The CRF committed $300 million. Closed November 10, 2025.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "NY State CRF",
    fund: "Stonepeak Global Renewables Fund I",
    gp: "Stonepeak Partners",
    metric: "Performance",
    value: "14.2% net IRR",
    asset_class: "Real Assets",
    source: "NY_CRF_Nov_2025.pdf",
    page: 4,
    evidence: "Stonepeak Global Renewables Fund I delivered 14.2% net IRR since inception. The fund is fully invested across global renewable energy infrastructure.",
    confidence: "high"
  },
  {
    date: "2025-11-18",
    lp: "NY State CRF",
    fund: "DIF Infrastructure VIII",
    gp: "CVC DIF Management",
    metric: "Fee Structure",
    value: "1.25% mgmt fee / 15% carry / 8% hurdle",
    asset_class: "Infrastructure",
    source: "NY_CRF_Nov_2025.pdf",
    page: 3,
    evidence: "DIF Infrastructure VIII fee terms: 1.25% management fee on committed capital, 15% carried interest above an 8% preferred return hurdle.",
    confidence: "high"
  },
  {
    date: "2025-11-04",
    lp: "NY State CRF",
    fund: "T. Rowe Price Global Equity",
    gp: "T. Rowe Price",
    metric: "Distribution",
    value: "$2,000,000,000",
    asset_class: "Public Equities",
    source: "NY_CRF_Nov_2025.pdf",
    page: 1,
    evidence: "Termination proceeds of approximately $2 billion were distributed from T. Rowe Price Global Equity following the manager termination decision.",
    confidence: "high"
  },
  {
    date: "2026-01-22",
    lp: "NJ DOI",
    fund: "ASF IX Infrastructure B",
    gp: "Ardian",
    metric: "Commitment",
    value: "$150,000,000",
    asset_class: "Infrastructure",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 1,
    evidence: "The Division is proposing an investment of up to $150 million in Ardian Secondary Fund (ASF) IX Infrastructure B, L.P., managed by Ardian.",
    confidence: "high"
  },
  {
    date: "2026-01-22",
    lp: "NJ DOI",
    fund: "ASF IX Infrastructure Co-Invest Sidecar",
    gp: "Ardian",
    metric: "Co-Investment",
    value: "$150,000,000",
    asset_class: "Infrastructure",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 1,
    evidence: "Up to $150 million to a co-investment sidecar vehicle alongside the Fund, managed by Ardian.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "NJ DOI",
    fund: "ASF VI Infrastructure (2014 vintage)",
    gp: "Ardian",
    metric: "Performance",
    value: "16.7% net IRR / 1.6x TVPI / 1.3x DPI",
    asset_class: "Infrastructure",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 4,
    evidence: "ASF VI Infrastructure 2014 Secondaries 16.7% net IRR; 1.6x Net TVPI; 1.3x Net DPI. Net as of 6/30/2025.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "NJ DOI",
    fund: "ASF VII Infrastructure (2017 vintage)",
    gp: "Ardian",
    metric: "Performance",
    value: "11.5% net IRR / 1.6x TVPI / 0.9x DPI",
    asset_class: "Infrastructure",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 4,
    evidence: "ASF VII Infrastructure 2017 Secondaries 11.5% net IRR; 1.6x Net TVPI; 0.9x Net DPI. Net as of 6/30/2025.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "NJ DOI",
    fund: "ASF VIII Infrastructure (2021 vintage)",
    gp: "Ardian",
    metric: "Performance",
    value: "10.7% net IRR / 1.1x TVPI / 0.1x DPI",
    asset_class: "Infrastructure",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 4,
    evidence: "ASF VIII Infrastructure 2021 Secondaries 10.7% net IRR; 1.1x Net TVPI; 0.1x Net DPI. Net as of 6/30/2025.",
    confidence: "high"
  },
  {
    date: "2026-01-22",
    lp: "NJ DOI",
    fund: "ASF IX Infrastructure B",
    gp: "Ardian",
    metric: "Fee Structure",
    value: "1% mgmt fee / 12.5% carry / 7% hurdle",
    asset_class: "Infrastructure",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 4,
    evidence: "Management Fee: 1% on commitments during the investment period; 0.675% on the lower of NAV or acquisition cost post the investment period. Incentive Fee: 12.5% Carry with a 7% hurdle.",
    confidence: "high"
  },
  {
    date: "2026-01-22",
    lp: "NJ DOI",
    fund: "ASF IX Infrastructure B",
    gp: "Ardian",
    metric: "Target Fund Size",
    value: "$7,500,000,000",
    asset_class: "Infrastructure",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 3,
    evidence: "Target Fund Size: $7.5 billion. Strategy: Real Assets \u2013 Infrastructure Secondaries. Target Returns: 12-14% Net IRR.",
    confidence: "high"
  },
  {
    date: "2026-01-15",
    lp: "NJ DOI",
    fund: "Goldman Sachs Real Estate Partners 2025",
    gp: "Goldman Sachs",
    metric: "Commitment",
    value: "$200,000,000",
    asset_class: "Real Estate",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 6,
    evidence: "The Division is proposing an investment of up to $200 million in Goldman Sachs Real Estate Partners 2025, a value-add real estate fund.",
    confidence: "high"
  },
  {
    date: "2026-01-15",
    lp: "NJ DOI",
    fund: "Ares Capital Solutions Fund II",
    gp: "Ares Management",
    metric: "Commitment",
    value: "$175,000,000",
    asset_class: "Credit",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 7,
    evidence: "The Division is proposing an investment of up to $175 million in Ares Capital Solutions Fund II, a direct lending and credit solutions vehicle.",
    confidence: "high"
  },
  {
    date: "2026-01-15",
    lp: "NJ DOI",
    fund: "Brookfield Infrastructure Fund VI",
    gp: "Brookfield Asset Management",
    metric: "Commitment",
    value: "$250,000,000",
    asset_class: "Infrastructure",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 2,
    evidence: "The Division is proposing an investment of up to $250 million in Brookfield Infrastructure Fund VI, targeting essential service infrastructure globally.",
    confidence: "high"
  },
  {
    date: "2026-01-15",
    lp: "NJ DOI",
    fund: "EQT X",
    gp: "EQT Group",
    metric: "Commitment",
    value: "$200,000,000",
    asset_class: "Private Equity",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 8,
    evidence: "The Division is proposing an investment of up to $200 million in EQT X, a Northern European-focused private equity buyout fund managed by EQT.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "NJ DOI",
    fund: "ASF V Infrastructure (2012 vintage)",
    gp: "Ardian",
    metric: "Performance",
    value: "18.3% net IRR / 2.1x TVPI / 1.8x DPI",
    asset_class: "Infrastructure",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 4,
    evidence: "ASF V Infrastructure 2012 Secondaries 18.3% net IRR; 2.1x Net TVPI; 1.8x Net DPI. Substantially realized. Net as of 6/30/2025.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "NJ DOI",
    fund: "Goldman Sachs RE Partners 2019",
    gp: "Goldman Sachs",
    metric: "Performance",
    value: "12.8% net IRR / 1.4x TVPI / 0.6x DPI",
    asset_class: "Real Estate",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 9,
    evidence: "Goldman Sachs Real Estate Partners 2019 vintage: 12.8% net IRR; 1.4x Net TVPI; 0.6x Net DPI as of 6/30/2025. Fund remains in investment period.",
    confidence: "high"
  },
  {
    date: "2026-01-15",
    lp: "NJ DOI",
    fund: "Brookfield Infrastructure Fund VI",
    gp: "Brookfield Asset Management",
    metric: "Fee Structure",
    value: "1.5% mgmt fee / 20% carry / 8% hurdle",
    asset_class: "Infrastructure",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 3,
    evidence: "Brookfield Infrastructure Fund VI fee terms: 1.5% management fee on committed capital during investment period, 20% carried interest, 8% hurdle.",
    confidence: "high"
  },
  {
    date: "2026-01-15",
    lp: "NJ DOI",
    fund: "EQT X",
    gp: "EQT Group",
    metric: "Fee Structure",
    value: "2.0% mgmt fee / 20% carry / 8% hurdle",
    asset_class: "Private Equity",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 8,
    evidence: "EQT X fee terms: 2.0% management fee on committed capital, 20% carried interest with 8% preferred return. Fee steps down post-investment period.",
    confidence: "high"
  },
  {
    date: "2025-12-31",
    lp: "NJ DOI",
    fund: "Total PE Portfolio",
    gp: "Multiple",
    metric: "NAV",
    value: "$12,400,000,000",
    asset_class: "Private Equity",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 5,
    evidence: "Total Private Equity portfolio net asset value as of 12/31/2025: $12.4 billion across 45 active fund relationships and 12 co-investments.",
    confidence: "high"
  },
  {
    date: "2025-12-31",
    lp: "NJ DOI",
    fund: "Total Real Estate Portfolio",
    gp: "Multiple",
    metric: "NAV",
    value: "$5,800,000,000",
    asset_class: "Real Estate",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 6,
    evidence: "Total Real Estate portfolio net asset value as of 12/31/2025: $5.8 billion. Portfolio is 78% domestic and 22% international exposure.",
    confidence: "high"
  },
  {
    date: "2026-01-15",
    lp: "NJ DOI",
    fund: "Brookfield Infrastructure Fund VI",
    gp: "Brookfield Asset Management",
    metric: "Target Fund Size",
    value: "$12,000,000,000",
    asset_class: "Infrastructure",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 2,
    evidence: "Brookfield Infrastructure Fund VI target fund size: $12 billion. Would be the largest closed-end infrastructure fund raised by Brookfield.",
    confidence: "high"
  },
  {
    date: "2026-01-15",
    lp: "NJ DOI",
    fund: "Ares Capital Solutions Fund II",
    gp: "Ares Management",
    metric: "Target Fund Size",
    value: "$5,500,000,000",
    asset_class: "Credit",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 7,
    evidence: "Ares Capital Solutions Fund II target fund size: $5.5 billion. Strategy focuses on direct lending to upper middle market companies.",
    confidence: "high"
  },
  {
    date: "2025-12-31",
    lp: "NJ DOI",
    fund: "NJ DOI Total Fund",
    gp: "Multiple",
    metric: "AUM",
    value: "$102,000,000,000",
    asset_class: "Total Fund",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 1,
    evidence: "Total NJ Division of Investment fund assets under management: $102 billion as of 12/31/2025. The fund crossed the $100B milestone in Q4 2025.",
    confidence: "high"
  },
  {
    date: "2026-01-15",
    lp: "NJ DOI",
    fund: "EQT X Co-Invest Sidecar",
    gp: "EQT Group",
    metric: "Co-Investment",
    value: "$100,000,000",
    asset_class: "Private Equity",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 8,
    evidence: "Up to $100 million to a co-investment sidecar vehicle alongside EQT X, managed by EQT. No management fee or carry on co-invest vehicle.",
    confidence: "high"
  },
  {
    date: "2025-12-15",
    lp: "NJ DOI",
    fund: "Ardian ASF VI",
    gp: "Ardian",
    metric: "Distribution",
    value: "$85,000,000",
    asset_class: "Infrastructure",
    source: "NJ_SIC_Jan_2026.pdf",
    page: 10,
    evidence: "Distribution of $85 million received from Ardian ASF VI Infrastructure fund. Represents partial realization of secondary infrastructure positions.",
    confidence: "high"
  },
  {
    date: "2026-01-29",
    lp: "DCRB",
    fund: "Fund AN (undisclosed)",
    gp: "Undisclosed",
    metric: "Commitment",
    value: "$150,000,000",
    asset_class: "Infrastructure",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 7,
    evidence: "To approve a commitment of up to $150 million to 'Fund AN', a private infrastructure fund, pending legal review and final due diligence.",
    confidence: "high"
  },
  {
    date: "2025-11-26",
    lp: "DCRB",
    fund: "Quantum Energy Partners IX",
    gp: "Quantum Energy Partners",
    metric: "Commitment",
    value: "$100,000,000",
    asset_class: "Natural Resources",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 5,
    evidence: "Closed on a $100mn re-up commitment on 11/26/2025 in Quantum Energy Partners IX.",
    confidence: "high"
  },
  {
    date: "2025-12-05",
    lp: "DCRB",
    fund: "Updata Fund VIII",
    gp: "Updata Partners",
    metric: "Commitment",
    value: "$100,000,000",
    asset_class: "Private Equity",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 5,
    evidence: "Closed on a $100mn re-up commitment on 12/5/2025 in Updata Fund VIII.",
    confidence: "high"
  },
  {
    date: "2026-01-27",
    lp: "DCRB",
    fund: "Total Fund",
    gp: "Multiple",
    metric: "AUM",
    value: "$14,100,000,000",
    asset_class: "Total Fund",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 5,
    evidence: "Total Market Value of the Fund: a new high of $14.1 billion. Calendar Year End 2025: 14.1%. Fiscal Year Ended 2025: 10.25%. Fiscal YTD 2026: 4.3%.",
    confidence: "high"
  },
  {
    date: "2026-01-20",
    lp: "DCRB",
    fund: "Carlyle Realty Partners X",
    gp: "Carlyle Group",
    metric: "Commitment",
    value: "$75,000,000",
    asset_class: "Real Estate",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 6,
    evidence: "Board approved a commitment of $75 million to Carlyle Realty Partners X, a U.S. value-add real estate fund focused on opportunistic strategies.",
    confidence: "high"
  },
  {
    date: "2026-01-20",
    lp: "DCRB",
    fund: "Apollo Natural Resources Fund IV",
    gp: "Apollo Management",
    metric: "Commitment",
    value: "$50,000,000",
    asset_class: "Natural Resources",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 6,
    evidence: "Board approved a commitment of $50 million to Apollo Natural Resources Fund IV, targeting energy transition and natural resource opportunities.",
    confidence: "high"
  },
  {
    date: "2026-01-20",
    lp: "DCRB",
    fund: "Ares Management Credit Fund V",
    gp: "Ares Management",
    metric: "Commitment",
    value: "$100,000,000",
    asset_class: "Credit",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 7,
    evidence: "Board approved a commitment of $100 million to Ares Management Credit Fund V, a senior direct lending fund targeting upper middle market borrowers.",
    confidence: "high"
  },
  {
    date: "2026-01-20",
    lp: "DCRB",
    fund: "KKR Americas Fund XIII",
    gp: "KKR",
    metric: "Commitment",
    value: "$125,000,000",
    asset_class: "Private Equity",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 7,
    evidence: "Board approved a commitment of $125 million to KKR Americas Fund XIII, a large-cap buyout fund focused on North American companies.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "DCRB",
    fund: "Quantum Energy Partners VIII",
    gp: "Quantum Energy Partners",
    metric: "Performance",
    value: "22.8% net IRR / 1.7x TVPI / 1.1x DPI",
    asset_class: "Natural Resources",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 8,
    evidence: "Quantum Energy Partners VIII 2019 vintage: 22.8% net IRR; 1.7x Net TVPI; 1.1x Net DPI as of 6/30/2025. Strong energy market tailwinds.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "DCRB",
    fund: "Updata Fund VII",
    gp: "Updata Partners",
    metric: "Performance",
    value: "18.5% net IRR / 1.6x TVPI / 0.9x DPI",
    asset_class: "Private Equity",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 8,
    evidence: "Updata Fund VII 2020 vintage: 18.5% net IRR; 1.6x Net TVPI; 0.9x Net DPI as of 6/30/2025. Growth equity in B2B software companies.",
    confidence: "high"
  },
  {
    date: "2025-12-31",
    lp: "DCRB",
    fund: "Total Fund CY2025",
    gp: "Multiple",
    metric: "Performance",
    value: "14.1% calendar year return",
    asset_class: "Total Fund",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 5,
    evidence: "Total Fund calendar year 2025 net return: 14.1%. Outperformed the policy benchmark by 120 basis points. Fiscal year ended 2025: 10.25%.",
    confidence: "high"
  },
  {
    date: "2025-12-31",
    lp: "DCRB",
    fund: "Total Private Equity",
    gp: "Multiple",
    metric: "NAV",
    value: "$3,200,000,000",
    asset_class: "Private Equity",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 4,
    evidence: "Total Private Equity portfolio net asset value: $3.2 billion as of 12/31/2025. Represents 22.7% of total fund assets across 28 fund relationships.",
    confidence: "high"
  },
  {
    date: "2025-12-31",
    lp: "DCRB",
    fund: "Total Real Estate",
    gp: "Multiple",
    metric: "NAV",
    value: "$1,800,000,000",
    asset_class: "Real Estate",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 4,
    evidence: "Total Real Estate portfolio net asset value: $1.8 billion as of 12/31/2025. Represents 12.8% of total fund, split 65% core / 35% value-add.",
    confidence: "high"
  },
  {
    date: "2026-01-20",
    lp: "DCRB",
    fund: "KKR Americas Fund XIII",
    gp: "KKR",
    metric: "Fee Structure",
    value: "1.75% mgmt fee / 20% carry / 8% hurdle",
    asset_class: "Private Equity",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 7,
    evidence: "KKR Americas Fund XIII fee terms: 1.75% management fee on committed capital, 20% carried interest with 8% preferred return. Fee offset for board seats.",
    confidence: "high"
  },
  {
    date: "2025-11-30",
    lp: "DCRB",
    fund: "Quantum Energy Partners VII",
    gp: "Quantum Energy Partners",
    metric: "Distribution",
    value: "$45,000,000",
    asset_class: "Natural Resources",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 9,
    evidence: "Distribution of $45 million received from Quantum Energy Partners VII. Fund is in harvest mode with 1.1x DPI and strong remaining portfolio value.",
    confidence: "high"
  },
  {
    date: "2026-01-20",
    lp: "DCRB",
    fund: "KKR Americas Fund XIII",
    gp: "KKR",
    metric: "Target Fund Size",
    value: "$20,000,000,000",
    asset_class: "Private Equity",
    source: "DCRB_Board_Jan_2026.pdf",
    page: 7,
    evidence: "KKR Americas Fund XIII target fund size: $20 billion. Would be the largest Americas-focused PE fund raised by KKR to date.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "Santa Barbara ERS",
    fund: "PRR Portfolio (total)",
    gp: "Hamilton Lane",
    metric: "Performance",
    value: "11.36% since inception IRR",
    asset_class: "Real Assets",
    source: "SBCERS_Q2_2025.pdf",
    page: 4,
    evidence: "Since inception IRR increased 6 basis points from the prior quarter. The Portfolio outperformed its designated benchmark, CPI-U + 400 bps, by 460 bps on a since inception basis.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "Santa Barbara ERS",
    fund: "PRR Portfolio (total)",
    gp: "Hamilton Lane",
    metric: "NAV",
    value: "$553,900,000",
    asset_class: "Real Assets",
    source: "SBCERS_Q2_2025.pdf",
    page: 5,
    evidence: "Ending Market Value $553.9M. Unfunded Commitments $255.4M. Total Exposure $809.3M. Capital Committed $815.1M.",
    confidence: "high"
  },
  {
    date: "2025-04-24",
    lp: "Santa Barbara ERS",
    fund: "ECP VI, L.P.",
    gp: "Energy Capital Partners",
    metric: "Commitment",
    value: "$7,500,000",
    asset_class: "Infrastructure",
    source: "SBCERS_Q2_2025.pdf",
    page: 9,
    evidence: "ECP VI, L.P. \u2014 Infrastructure \u2014 North America \u2014 $7.5M. Closing Date: 4/24/2025.",
    confidence: "high"
  },
  {
    date: "2025-10-22",
    lp: "Santa Barbara ERS",
    fund: "Arcus European Infrastructure Fund IV",
    gp: "Arcus Infrastructure Partners",
    metric: "Commitment",
    value: "$7,500,000",
    asset_class: "Infrastructure",
    source: "SBCERS_Q2_2025.pdf",
    page: 9,
    evidence: "Arcus European Infrastructure Fund IV, LP \u2014 Infrastructure \u2014 $7.5M (\u20AC6.4M). Closing Date: 10/22/2025.",
    confidence: "high"
  },
  {
    date: "2025-10-31",
    lp: "Santa Barbara ERS",
    fund: "RRG Sustainable Water Impact Fund II",
    gp: "RRG Capital Management",
    metric: "Commitment",
    value: "$7,500,000",
    asset_class: "Natural Resources",
    source: "SBCERS_Q2_2025.pdf",
    page: 9,
    evidence: "RRG Sustainable Water Impact Fund II, L.P. \u2014 Natural Resources \u2014 North America \u2014 $7.5M. Closing Date: 10/31/2025.",
    confidence: "high"
  },
  {
    date: "2025-11-17",
    lp: "Santa Barbara ERS",
    fund: "NOVA Infrastructure Fund II",
    gp: "NOVA Infrastructure Management",
    metric: "Commitment",
    value: "$7,500,000",
    asset_class: "Infrastructure",
    source: "SBCERS_Q2_2025.pdf",
    page: 9,
    evidence: "NOVA Infrastructure Fund II, L.P. \u2014 Infrastructure \u2014 North America \u2014 $7.5M. Closing Date: 11/17/2025.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "Santa Barbara ERS",
    fund: "HitecVision North Sea Opportunity Fund",
    gp: "HitecVision",
    metric: "Performance",
    value: "59.6% since inception IRR",
    asset_class: "Natural Resources",
    source: "SBCERS_Q2_2025.pdf",
    page: 17,
    evidence: "HitecVision North Sea Opportunity Fund, L.P. \u2014 2020 vintage \u2014 Natural Resources \u2014 Since Inception IRR: 59.6%.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "Santa Barbara ERS",
    fund: "Blackstone Energy Partners III",
    gp: "Blackstone",
    metric: "Performance",
    value: "25.3% since inception IRR",
    asset_class: "Natural Resources",
    source: "SBCERS_Q2_2025.pdf",
    page: 17,
    evidence: "Blackstone Energy Partners III, L.P. \u2014 2020 vintage \u2014 Natural Resources \u2014 Since Inception IRR: 25.3%.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "Santa Barbara ERS",
    fund: "Blackstone Energy Transition Partners IV",
    gp: "Blackstone",
    metric: "Performance",
    value: "40.7% since inception IRR",
    asset_class: "Infrastructure",
    source: "SBCERS_Q2_2025.pdf",
    page: 17,
    evidence: "Blackstone Energy Transition Partners IV, L.P. \u2014 2022 vintage \u2014 Infrastructure \u2014 Since Inception IRR: 40.7%.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "Santa Barbara ERS",
    fund: "Apollo Natural Resources Partners III",
    gp: "Apollo Management",
    metric: "Performance",
    value: "18.2% since inception IRR",
    asset_class: "Natural Resources",
    source: "SBCERS_Q2_2025.pdf",
    page: 17,
    evidence: "Apollo Natural Resources Partners III, L.P. \u2014 2019 vintage \u2014 Natural Resources \u2014 Since Inception IRR: 18.2%.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "Santa Barbara ERS",
    fund: "Blue Road Capital II",
    gp: "Blue Road Capital",
    metric: "Performance",
    value: "22.4% since inception IRR",
    asset_class: "Natural Resources",
    source: "SBCERS_Q2_2025.pdf",
    page: 17,
    evidence: "Blue Road Capital II, L.P. \u2014 2022 vintage \u2014 Natural Resources \u2014 Since Inception IRR: 22.4%.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "Santa Barbara ERS",
    fund: "EQT Infrastructure III",
    gp: "EQT Group",
    metric: "Performance",
    value: "20.1% since inception IRR",
    asset_class: "Infrastructure",
    source: "SBCERS_Q2_2025.pdf",
    page: 17,
    evidence: "EQT Infrastructure III, L.P. \u2014 2017 vintage \u2014 Infrastructure \u2014 Since Inception IRR: 20.1%.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "Santa Barbara ERS",
    fund: "Total Infrastructure Portfolio",
    gp: "Hamilton Lane",
    metric: "NAV",
    value: "$198,500,000",
    asset_class: "Infrastructure",
    source: "SBCERS_Q2_2025.pdf",
    page: 8,
    evidence: "Total Infrastructure portfolio ending market value: $198.5 million as of 6/30/2025. Represents 35.8% of total PRR portfolio allocation.",
    confidence: "high"
  },
  {
    date: "2025-12-15",
    lp: "Santa Barbara ERS",
    fund: "Brookfield Super-Core Infrastructure Partners",
    gp: "Brookfield Asset Management",
    metric: "Commitment",
    value: "$10,000,000",
    asset_class: "Infrastructure",
    source: "SBCERS_Q2_2025.pdf",
    page: 9,
    evidence: "Brookfield Super-Core Infrastructure Partners \u2014 Infrastructure \u2014 Global \u2014 $10.0M. Open-end vehicle targeting essential service infrastructure.",
    confidence: "high"
  },
  {
    date: "2025-06-30",
    lp: "Santa Barbara ERS",
    fund: "Stonepeak Infrastructure Partners III",
    gp: "Stonepeak Partners",
    metric: "Performance",
    value: "15.8% since inception IRR",
    asset_class: "Infrastructure",
    source: "SBCERS_Q2_2025.pdf",
    page: 17,
    evidence: "Stonepeak Infrastructure Partners III, L.P. \u2014 2019 vintage \u2014 Infrastructure \u2014 Since Inception IRR: 15.8%.",
    confidence: "high"
  },
  {
    date: "2025-04-24",
    lp: "Santa Barbara ERS",
    fund: "ECP VI",
    gp: "Energy Capital Partners",
    metric: "Fee Structure",
    value: "1.5% mgmt fee / 20% carry / 8% hurdle",
    asset_class: "Infrastructure",
    source: "SBCERS_Q2_2025.pdf",
    page: 10,
    evidence: "ECP VI, L.P. fee terms: 1.5% management fee on committed capital, 20% carried interest above an 8% preferred return hurdle rate.",
    confidence: "high"
  }
];

export const signals: Signal[] = [
  {
    type: "Multi-LP Signal",
    description: "Stonepeak received $323M from NY State CRF (fund + co-invest) to Global Renewables Fund II. High conviction \u2014 both fund commitment and co-invest in same month."
  },
  {
    type: "Large Termination",
    description: "NY State CRF terminated T. Rowe Price ($2B account). Capital moved to cash. Potential reallocation to alternatives or new public equity manager."
  },
  {
    type: "New High",
    description: "DCRB total fund value reached all-time high of $14.1B. Calendar year 2025 net return: 14.1%. Fiscal YTD 2026: 4.3%."
  },
  {
    type: "Infrastructure Secondaries",
    description: "NJ DOI proposing $300M (fund + co-invest) to Ardian ASF IX. Target $7.5B \u2014 would be largest dedicated infra secondaries fund. Prior funds delivered 10.7-16.7% net IRR."
  },
  {
    type: "GP Fundraising Signal",
    description: "Brookfield targeting $12B for Infrastructure Fund VI, which would be their largest closed-end infra fund. NJ DOI anchoring with $250M commitment signals strong institutional demand."
  },
  {
    type: "Performance Divergence",
    description: "Ardian infra secondaries showing declining IRR trend across vintages: ASF V (18.3%), ASF VI (16.7%), ASF VII (11.5%), ASF VIII (10.7%). Later vintages still early but trend bears monitoring."
  },
  {
    type: "Real Estate Rotation",
    description: "NJ DOI ($200M to Goldman Sachs RE Partners 2025) and DCRB ($75M to Carlyle Realty Partners X) both making new real estate commitments in January 2026, signaling renewed conviction in value-add RE."
  },
  {
    type: "Credit Allocation",
    description: "NJ DOI ($175M to Ares Capital Solutions II) and DCRB ($100M to Ares Credit Fund V) both increasing credit allocation through the same GP. Ares capturing $275M across two major LPs."
  },
  {
    type: "Co-Investment Trend",
    description: "Three co-investment sidecars detected totaling $330M: NY CRF Stonepeak co-invest ($80M), NJ DOI Ardian sidecar ($150M), and NJ DOI EQT X sidecar ($100M). LPs seeking fee-free exposure."
  },
  {
    type: "Fee Compression",
    description: "Average management fees down ~15bps vs. prior vintage funds. Ardian ASF IX at 1.0% and DIF VIII at 1.25% compare favorably to industry standard 1.5-2.0% for similar strategies."
  },
  {
    type: "AUM Milestone",
    description: "NJ DOI crossed $102B total fund AUM and DCRB hit $14.1B all-time high in the same reporting period. Combined $116B in assets across just two pension systems."
  },
  {
    type: "Natural Resources Momentum",
    description: "DCRB ($100M Quantum IX, $50M Apollo Nat Res IV) and Santa Barbara ($7.5M RRG Water Fund) both increasing natural resources exposure. DCRB\u2019s Quantum VIII returning 22.8% net IRR."
  },
  {
    type: "Manager Concentration",
    description: "Blackstone appearing across 3 LP portfolios: Santa Barbara (Energy Partners III at 25.3% IRR, Energy Transition IV at 40.7% IRR). Cross-LP GP relationship mapping enabled."
  },
  {
    type: "Distribution Uptick",
    description: "$2.13B in distributions detected across the dataset, led by T. Rowe Price termination proceeds ($2B). Ardian ASF VI ($85M) and Quantum VII ($45M) contributing realized capital returns."
  }
];

export const trackers: Tracker[] = [
  {
    name: "Infra commitments \u2014 top US pension funds",
    status: "active",
    sources: 4,
    metrics: 12,
    last_match: "Today",
    frequency: "Weekly",
    latestFinding: "Macquarie, Ardian, and related infrastructure activity surfaced across board and memo-style documents.",
    newAlerts: 3,
  },
  {
    name: "Manager terminations Q4 2025",
    status: "active",
    sources: 6,
    metrics: 3,
    last_match: "2 days ago",
    frequency: "Daily",
    latestFinding: "NY State CRF termination activity remains the most material governance-driven capital movement in the current sample.",
    newAlerts: 1,
  },
  {
    name: "Private markets performance watch",
    status: "active",
    sources: 3,
    metrics: 8,
    last_match: "5 days ago",
    frequency: "Monthly",
    latestFinding: "Santa Barbara PRR continues to anchor clean performance extraction with one-year IRR, market value, and unfunded commitment visibility.",
    newAlerts: 2,
  },
  {
    name: "Fee terms and fund economics",
    status: "paused",
    sources: 2,
    metrics: 5,
    last_match: "12 days ago",
    frequency: "Monthly",
    latestFinding: "Ardian ASF IX remains the clearest current memo example for target return, fund size, and fee/carry extraction.",
    newAlerts: 0,
  },
];

export function getMetricsByLP(lp: string): Metric[] {
  return metrics.filter((m) => m.lp === lp);
}

export function getMetricsByGP(gp: string): Metric[] {
  return metrics.filter((m) => m.gp === gp);
}

export function getUniqueAssetClasses(): string[] {
  return [...new Set(metrics.map((m) => m.asset_class))];
}

export function getUniqueLPs(): string[] {
  return [...new Set(metrics.map((m) => m.lp))];
}

export function getUniqueGPs(): string[] {
  return [...new Set(metrics.map((m) => m.gp))];
}

export function getCommitmentTotal(): number {
  return metrics
    .filter((m) => m.metric === 'Commitment')
    .reduce((sum, m) => {
      const rawValue = m.value.replace(/,/g, '');
      const euroMatch = rawValue.match(/\u20AC([\d.]+)/);
      if (euroMatch) {
        return sum + parseFloat(euroMatch[1]) * 1.08;
      }
      const usdMatch = rawValue.match(/\$([\d.]+)/);
      if (usdMatch) {
        return sum + parseFloat(usdMatch[1]);
      }
      return sum;
    }, 0);
}
