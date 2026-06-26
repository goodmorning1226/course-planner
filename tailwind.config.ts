import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Neutral, non-NTU palette. Deliberately not using NTU's official
        // green/maroon to avoid looking like an official site.
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        card: "hsl(var(--card))",
        warning: "hsl(var(--warning))",
      },
      borderRadius: {
        lg: "0.625rem",
        md: "0.45rem",
        sm: "0.3rem",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Noto Sans TC",
          "PingFang TC",
          "Microsoft JhengHei",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
