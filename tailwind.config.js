module.exports = {
  darkMode: "class", 
  content: ["./**/*.{html,js}"],
  theme: {
    extend: {
      colors: { 
        "primary": "#2563eb", "on-primary": "#ffffff", "primary-container": "#dbeafe", "on-primary-container": "#1e3a8a", "secondary": "#1d4ed8", "on-secondary": "#ffffff", "secondary-container": "#bfdbfe", "on-secondary-container": "#1e3a8a", "tertiary": "#3b82f6", "on-tertiary": "#ffffff", "tertiary-container": "#eff6ff", "on-tertiary-container": "#172554", "error": "#ef4444", "on-error": "#ffffff", "error-container": "#fecaca", "on-error-container": "#7f1d1d", "background": "#f0f9ff", "on-background": "#0f172a", "surface": "#f0f9ff", "on-surface": "#0f172a", "surface-variant": "#e2e8f0", "on-surface-variant": "#475569", "outline": "#94a3b8", "outline-variant": "#cbd5e1", "inverse-surface": "#1e293b", "inverse-on-surface": "#f1f5f9", "inverse-primary": "#93c5fd", "surface-container-lowest": "#ffffff", "surface-container-low": "#f8fafc", "surface-container": "#f1f5f9", "surface-container-high": "#e2e8f0", "surface-container-highest": "#cbd5e1" 
      }, 
      borderRadius: {
        DEFAULT: "0.25rem", lg: "0.5rem", xl: "0.75rem", full: "9999px"
      }, 
      spacing: {
        md: "24px", lg: "48px", xl: "80px", sm: "12px", "container-max": "1280px", gutter: "24px", base: "8px", xs: "4px"
      }, 
      fontFamily: {
        "display-lg": ["Montserrat"], "label-md": ["Montserrat"], "body-md": ["Montserrat"], "headline-md": ["Montserrat"], caption: ["Montserrat"], "headline-lg": ["Montserrat"], "headline-lg-mobile": ["Montserrat"], "body-lg": ["Montserrat"], headline: ["Montserrat"], display: ["Montserrat"], body: ["Montserrat"], label: ["Montserrat"]
      }, 
      fontSize: {
        "display-lg": ["48px", {lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700"}], "label-md": ["14px", {lineHeight: "1.2", letterSpacing: "0.05em", fontWeight: "600"}], "body-md": ["16px", {lineHeight: "1.5", fontWeight: "400"}], "headline-md": ["24px", {lineHeight: "1.3", fontWeight: "600"}], caption: ["12px", {lineHeight: "1.4", fontWeight: "500"}], "headline-lg": ["32px", {lineHeight: "1.2", fontWeight: "700"}], "headline-lg-mobile": ["28px", {lineHeight: "1.2", fontWeight: "700"}], "body-lg": ["18px", {lineHeight: "1.6", fontWeight: "400"}]
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries')
  ]
};
