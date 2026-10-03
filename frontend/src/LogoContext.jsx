import { createContext, useEffect, useState } from "react";
import ActelyoLogo from "./media/logo/actelyo-logo-nobg.png";
import System from "./models/system";
export const REFETCH_LOGO_EVENT = "refetch-logo";
export const LogoContext = createContext();
export function LogoProvider({ children }) {
  const [logo, setLogo] = useState(ActelyoLogo);
  const [loginLogo, setLoginLogo] = useState(ActelyoLogo);
  const [isCustomLogo, setIsCustomLogo] = useState(false);
  async function fetchInstanceLogo() {
    try {
      const result = await System.fetchLogo();
      const custom = Boolean(result.isCustomLogo && result.logoURL);
      setLogo(custom ? result.logoURL : ActelyoLogo);
      setLoginLogo(custom ? result.logoURL : ActelyoLogo);
      setIsCustomLogo(custom);
    } catch {
      setLogo(ActelyoLogo); setLoginLogo(ActelyoLogo); setIsCustomLogo(false);
    }
  }
  useEffect(() => {
    fetchInstanceLogo();
    window.addEventListener(REFETCH_LOGO_EVENT, fetchInstanceLogo);
    return () => window.removeEventListener(REFETCH_LOGO_EVENT, fetchInstanceLogo);
  }, []);
  return <LogoContext.Provider value={{ logo, setLogo, loginLogo, isCustomLogo }}>{children}</LogoContext.Provider>;
}
