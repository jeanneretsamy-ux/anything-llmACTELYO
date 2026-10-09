import paths from "@/utils/paths";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import useRedirectToHomeOnOnboardingComplete from "@/hooks/useOnboardingComplete";
import ActelyoLogo from "@/media/logo/actelyo-logo-nobg.png";

export default function OnboardingHome() {
  const navigate = useNavigate();
  useRedirectToHomeOnOnboardingComplete();
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex flex-col items-center bg-zinc-950 light:bg-slate-50 text-white light:text-slate-800 px-6">
      <header className="flex items-center gap-4 pt-10">
        <img src={ActelyoLogo} alt="Actelyo" className="h-16 w-auto rounded-lg p-2" style={{ backgroundColor: "#102a43" }} />
        <span className="font-medium text-xl">Actelyo RAG</span>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center text-center w-full max-w-3xl py-12">
        <h1 className="font-medium text-4xl md:text-6xl leading-tight">{t("onboarding.home.welcome")}</h1>
        <button type="button" onClick={() => navigate(paths.onboarding.llmPreference())}
          className="mt-10 rounded-lg px-8 py-3 bg-slate-50 text-slate-900 light:bg-slate-900 light:text-white font-medium">
          {t("onboarding.home.getStarted")}
        </button>
      </main>
    </div>
  );
}
