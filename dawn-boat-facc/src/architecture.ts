export type ArchitectureDecisionStatus =
  "discovery" | "analyzing" | "recommended" | "accepted";

export interface ArchitectureDecisionState {
  title: string;
  problem: string;
  requirements: string[];
  constraints: string[];
  assumptions: string[];
  openQuestions: string[];
  alternatives: ArchitectureAlternative[];
  recommendation: ArchitectureRecommendation | null;
  status: ArchitectureDecisionStatus;
}

export interface ArchitectureAlternative {
  name: string;
  summary: string;
  strengths: string[];
  tradeoffs: string[];
}

export const initialDecisionState: ArchitectureDecisionState = {
  title: "New Architecture Decision",
  problem: "",
  requirements: [],
  constraints: [],
  assumptions: [],
  openQuestions: [],
  alternatives: [],
  recommendation: null,
  status: "discovery",
  adr: null,
};

export interface ArchitectureRecommendation {
  alternative: string;
  rationale: string;
  acceptedTradeoffs: string[];
}

export interface ArchitectureDecisionState {
  title: string;
  problem: string;
  requirements: string[];
  constraints: string[];
  assumptions: string[];
  openQuestions: string[];
  alternatives: ArchitectureAlternative[];

  recommendation: ArchitectureRecommendation | null;
  adr: ArchitectureDecisionRecord | null;
  status: "discovery" | "analyzing" | "recommended" | "accepted";
}
export interface ArchitectureDecisionRecord {
  title: string;
  problem: string;
  requirements: string[];
  constraints: string[];
  alternatives: ArchitectureAlternative[];
  recommendation: ArchitectureRecommendation;
  acceptedAt: string;
}
