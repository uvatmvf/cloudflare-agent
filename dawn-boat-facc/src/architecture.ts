export type ArchitectureDecisionStatus =
    | "discovery"
    | "analyzing"
    | "recommended"
    | "accepted";

export interface ArchitectureDecisionState {
    title: string;
    problem: string;
    requirements: string[];
    constraints: string[];
    assumptions: string[];
    openQuestions: string[];
    alternatives: string[];
    recommendation: string | null;
    status: ArchitectureDecisionStatus;
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
    status: "discovery"
};