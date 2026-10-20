const THEME_STORAGE_KEY = "pulsestudio-theme";

export default function ThemeBootstrapScript() {
  const script = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");document.documentElement.dataset.theme=t==="light"?"light":"dark";}catch(e){document.documentElement.dataset.theme="dark";}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
