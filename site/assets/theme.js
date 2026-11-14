/* Runs before first paint (separate file for the strict CSP): applies the saved theme, marks that
   JavaScript runs (controls such as Share stay hidden without it) and hides the prerendered home view
   while a search/legacy URL is about to be rendered by app.js. */
(function () {
  var d = document.documentElement;
  d.setAttribute("data-js", "");
  try {
    var t = localStorage.getItem("theme");
    if (t === "dark" || t === "light") d.setAttribute("data-theme", t);
  } catch (e) { /* storage unavailable */ }
  if (/[?&]q=/.test(location.search) || /^#\/(search|type)\//.test(location.hash)) {
    d.setAttribute("data-pending", "");
    setTimeout(function () { d.removeAttribute("data-pending"); }, 4000);
  }
})();
