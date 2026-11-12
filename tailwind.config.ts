import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1rem", sm: "1.5rem", lg: "2rem" },
      screens: { "2xl": "1280px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        plum: {
          50: "#f7f2f8",
          100: "#eee1f0",
          200: "#dcc4e0",
          300: "#c29dc8",
          400: "#a070a9",
          500: "#814e8b",
          600: "#683c72",
          700: "#55205c",
          800: "#46204c",
          900: "#3b1c40",
          950: "#240c28",
        },
        teal: {
          50: "#eefbfa",
          100: "#d2f5f3",
          200: "#aaeae8",
          300: "#72d9d7",
          400: "#3cc0bf",
          500: "#1fa5a4",
          600: "#009f9c",
          700: "#0f6a6b",
          800: "#125456",
          900: "#134649",
          950: "#04282b",
        },
        coral: {
          50: "#fef4f2",
          100: "#fee7e2",
          200: "#fed3ca",
          300: "#fcb5a7",
          400: "#f78b74",
          500: "#f47b68",
          600: "#dd4b2d",
          700: "#ba3a22",
          800: "#9a3320",
          900: "#803021",
          950: "#45150c",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgb(36 32 42 / 0.04), 0 1px 3px 0 rgb(36 32 42 / 0.06)",
        raised: "0 2px 4px -1px rgb(36 32 42 / 0.05), 0 8px 24px -6px rgb(36 32 42 / 0.10)",
        float: "0 12px 40px -12px rgb(85 32 92 / 0.22)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
