(() => {
  "use strict";

  const verticalLayer = document.querySelector(".background-parallax-y");
  if (!verticalLayer) return;

  const sun = document.querySelector("#home-sun");
  const scrollingElement = document.scrollingElement || document.documentElement;
  let scheduled = false;

  function updateBackgroundPosition() {
    scheduled = false;
    const scrollableHeight = Math.max(0, scrollingElement.scrollHeight - window.innerHeight);
    const progress = scrollableHeight === 0
      ? 0
      : Math.min(1, Math.max(0, scrollingElement.scrollTop / scrollableHeight));

    const imageTravel = Math.max(0, verticalLayer.offsetHeight - window.innerHeight);
    const offset = -progress * imageTravel;

    // At progress 0 the image starts at y=0. At progress 1 it has moved by
    // exactly imageHeight - viewportHeight, aligning both bottom edges.
    verticalLayer.style.setProperty("--background-parallax-offset", `${offset.toFixed(3)}px`);

    if (sun) {
      // The sun follows 88% of the page scroll, falling slightly behind
      // the foreground content.
      const sunOffset = scrollingElement.scrollTop * 0.12;
      sun.style.setProperty("--home-sun-parallax-offset", `${sunOffset.toFixed(3)}px`);
    }

  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(updateBackgroundPosition);
  }

  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("resize", scheduleUpdate, { passive: true });
  window.addEventListener("load", scheduleUpdate, { once: true });
  updateBackgroundPosition();
})();
