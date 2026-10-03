import ActelyoLogo from "@/media/logo/actelyo-logo-nobg.png";
export default function BackendUnavailable() {
  return <main className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 text-center bg-zinc-950 light:bg-slate-50 text-white light:text-slate-800">
    <img src={ActelyoLogo} alt="Actelyo" className="h-20 w-auto p-2 rounded-lg" style={{ backgroundColor: "#102a43" }} />
    <h1 className="text-2xl font-semibold">Actelyo LLMQushu</h1>
    <p role="alert">Le serveur local est indisponible. Démarrez le module LLMQushu puis réessayez.</p>
    <button type="button" onClick={() => window.location.reload()} className="rounded-lg px-6 py-3 bg-slate-800 text-white">Réessayer</button>
  </main>;
}
