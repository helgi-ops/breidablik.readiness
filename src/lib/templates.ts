export type TemplateBlock = {
  key: string;
  title: string;
  duration?: string;
  rounds?: number;
  sets?: number;
  items: string[];
};

export type MicrodoseTemplate = {
  id: string;
  code: string;
  name: string;
  color: "GREEN" | "YELLOW" | "RED";
  force_state: "FORCE" | "MAINTAIN" | "RECOVER";
  focus: "LOWER" | "UPPER" | "FULL";
  structure_type: "CONTRAST" | "CLUSTER" | "STRAIGHT" | "CIRCUIT";
  description: string | null;
  blocks: TemplateBlock[];
  constraints: Record<string, any>;
};
