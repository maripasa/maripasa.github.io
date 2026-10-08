(() => {
  "use strict";

  const cursor = document.querySelector("#wizard-cursor");
  const finePointer = window.matchMedia("(pointer: fine)");
  if (!cursor) return;

  const size = 64;
  const hotspotY = 32;
  let pointerX = -size;
  let pointerY = -size;
  let framePending = false;

  function render() {
    framePending = false;

    // The wand's middle-left point sits on the real pointer. The artwork can
    // pass through every viewport edge and is naturally clipped by the window.
    const left = pointerX;
    const top = pointerY - hotspotY;

    cursor.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  function scheduleRender() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(render);
  }

  function showAt(event) {
    if (!finePointer.matches || event.pointerType === "touch") return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    cursor.classList.add("is-visible");
    scheduleRender();
  }

  function hide() {
    cursor.classList.remove("is-visible");
  }

  function updateMode() {
    document.documentElement.classList.toggle("wizard-cursor-ready", finePointer.matches);
    if (!finePointer.matches) hide();
  }

  document.addEventListener("pointermove", showAt, { passive: true });
  window.addEventListener("blur", hide);
  window.addEventListener("mouseout", (event) => {
    if (!event.relatedTarget) hide();
  });
  window.addEventListener("resize", scheduleRender, { passive: true });
  finePointer.addEventListener("change", updateMode);
  updateMode();
})();
