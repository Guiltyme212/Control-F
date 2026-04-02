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
  }
];

export const trackers: Tracker[] = [
  {
    name: "Infra commitments \u2014 top US pension funds",
    status: "active",
    sources: 4,
    metrics: 12,
    last_match: "Today",
    frequency: "Weekly"
  },
  {
    name: "Manager terminations Q4 2025",
    status: "active",
    sources: 6,
    metrics: 3,
    last_match: "2 days ago",
    frequency: "Daily"
  },
  {
    name: "PE fund performance tracking",
    status: "active",
    sources: 3,
    metrics: 8,
    last_match: "5 days ago",
    frequency: "Monthly"
  },
  {
    name: "NJ DOI new investments",
    status: "paused",
    sources: 1,
    metrics: 3,
    last_match: "12 days ago",
    frequency: "Weekly"
  }
];
