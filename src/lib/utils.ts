import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function substituirVariaveis(template: string, vars: any): string {
  return template.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (match, key) => {
    const v = vars[key];
    return v ?? match;
  });
}

export function substituirVariaveisDeep(obj: any, vars: any): any {
  if (typeof obj === "string") {
    return substituirVariaveis(obj, vars);
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => substituirVariaveisDeep(v, vars));
  }
  if (obj !== null && typeof obj === "object") {
    const res: any = {};
    for (const key in obj) {
      res[key] = substituirVariaveisDeep(obj[key], vars);
    }
    return res;
  }
  return obj;
}
