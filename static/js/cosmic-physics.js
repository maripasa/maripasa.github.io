(() => {
  "use strict";

  const layer = document.querySelector("#cosmic-physics-layer");
  if (!layer) return;

  const earth = document.querySelector("#home-earth");
  const pageContent = document.querySelector("#content");
  const pageHeader = pageContent ? document.querySelector("header") : null;

  // The rocky planets use real diameter ratios with Earth = 32 px. The four
  // giants are compressed so the rocky planets remain usable on screen.
  const objects = [
    { name: "seda", src: "/images/space/seda.gif", width: 112, delay: 0, animated: true },
    { name: "mercúrio", src: "/images/space/mercury.png", width: 13, delay: 700 },
    { name: "vênus", src: "/images/space/venus.png", width: 31, delay: 1250 },
    { name: "marte", src: "/images/space/mars.png", width: 17, delay: 1800 },
    { name: "júpiter", src: "/images/space/jupiter.png", width: 85, delay: 2350 },
    { name: "saturno", src: "/images/space/saturn.png", width: 90, delay: 2900 },
    { name: "urano", src: "/images/space/uranus.png", width: 53, delay: 3450 },
    { name: "netuno", src: "/images/space/neptune.png", width: 52, delay: 4000 }
  ];

  const bodies = [];
  const frameInterval = 1000 / 30;
  let previousTime = performance.now();

  const viewportScale = () => Math.max(0.72, Math.min(1, window.innerWidth / 760));

  function makeMask(body) {
    const width = Math.max(1, Math.round(body.width));
    const height = Math.max(1, Math.round(body.height));
    const canvas = body.maskCanvas;
    const context = body.maskContext;
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(body.image, 0, 0, width, height);

    const rgba = context.getImageData(0, 0, width, height).data;
    const mask = new Uint8Array(width * height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let solidPixels = 0;

    for (let pixel = 0; pixel < mask.length; pixel += 1) {
      // The requested rule is exact: every non-zero alpha pixel is solid.
      if (rgba[pixel * 4 + 3] === 0) continue;
      mask[pixel] = 1;
      solidPixels += 1;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    body.mask = mask;
    body.maskWidth = width;
    body.maskHeight = height;
    body.bounds = maxX < 0
      ? { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 }
      : { minX, minY, maxX, maxY };
    // Opaque on-screen area is the body's mass: larger bodies pull harder,
    // while even Mercury keeps a small but non-zero influence.
    body.mass = Math.max(0.2, solidPixels / 450);
    body.gravitationalMass = body.name === "seda"
      ? Math.max(30, body.mass * 2.5)
      : body.mass;
  }

  function makeRectangleMask(body) {
    body.maskWidth = Math.max(1, body.width);
    body.maskHeight = Math.max(1, body.height);
    body.mask = new Uint8Array(body.maskWidth * body.maskHeight);
    body.mask.fill(1);
    body.bounds = body.width > 0 && body.height > 0
      ? { minX: 0, minY: 0, maxX: body.width - 1, maxY: body.height - 1 }
      : { minX: 0, minY: 0, maxX: -1, maxY: -1 };
  }

  function solidAt(body, x, y) {
    const pixelX = Math.floor(x);
    const pixelY = Math.floor(y);
    if (pixelX < 0 || pixelY < 0 || pixelX >= body.maskWidth || pixelY >= body.maskHeight) {
      return false;
    }
    return body.mask[pixelY * body.maskWidth + pixelX] === 1;
  }

  function opaqueWorldBounds(body) {
    return {
      left: body.x + body.bounds.minX,
      top: body.y + body.bounds.minY,
      right: body.x + body.bounds.maxX + 1,
      bottom: body.y + body.bounds.maxY + 1
    };
  }

  function pixelsOverlap(first, second) {
    const a = opaqueWorldBounds(first);
    const b = opaqueWorldBounds(second);
    const left = Math.ceil(Math.max(a.left, b.left));
    const top = Math.ceil(Math.max(a.top, b.top));
    const right = Math.floor(Math.min(a.right, b.right));
    const bottom = Math.floor(Math.min(a.bottom, b.bottom));

    if (left >= right || top >= bottom) return false;

    for (let worldY = top; worldY < bottom; worldY += 1) {
      const firstY = Math.floor(worldY - first.y);
      const secondY = Math.floor(worldY - second.y);
      for (let worldX = left; worldX < right; worldX += 1) {
        const firstX = Math.floor(worldX - first.x);
        const secondX = Math.floor(worldX - second.x);
        if (
          first.mask[firstY * first.maskWidth + firstX] === 1 &&
          second.mask[secondY * second.maskWidth + secondX] === 1
        ) return true;
      }
    }
    return false;
  }

  function collisionNormal(first, second) {
    const a = opaqueWorldBounds(first);
    const b = opaqueWorldBounds(second);
    let dx = (b.left + b.right - a.left - a.right) / 2;
    let dy = (b.top + b.bottom - a.top - a.bottom) / 2;
    if (Math.abs(dx) + Math.abs(dy) < 0.001) dy = 1;
    const length = Math.hypot(dx, dy);
    return { x: dx / length, y: dy / length };
  }

  function resolveCollision(first, second) {
    if (first.dragging && second.dragging) return;

    if (first.rectangle && !second.fixed) {
      resolveRectangleCollision(first, second);
      return;
    }
    if (second.rectangle && !first.fixed) {
      resolveRectangleCollision(second, first);
      return;
    }

    const normal = collisionNormal(first, second);
    const inverseFirst = first.dragging || first.fixed ? 0 : 1 / first.mass;
    const inverseSecond = second.dragging || second.fixed ? 0 : 1 / second.mass;
    const inverseTotal = inverseFirst + inverseSecond;
    if (inverseTotal === 0) return;

    // Separate only after an exact opaque-pixel overlap. Small iterative moves
    // keep transparent holes and Saturn's rings meaningful colliders.
    for (let attempt = 0; attempt < 12 && pixelsOverlap(first, second); attempt += 1) {
      if (!first.dragging && !first.fixed) {
        first.x -= normal.x * (inverseFirst / inverseTotal);
        first.y -= normal.y * (inverseFirst / inverseTotal);
      }
      if (!second.dragging && !second.fixed) {
        second.x += normal.x * (inverseSecond / inverseTotal);
        second.y += normal.y * (inverseSecond / inverseTotal);
      }
    }

    const relativeX = second.vx - first.vx;
    const relativeY = second.vy - first.vy;
    const closingSpeed = relativeX * normal.x + relativeY * normal.y;
    if (closingSpeed >= 0) return;

    const restitution = 0.62;
    const impulse = -(1 + restitution) * closingSpeed / inverseTotal;
    if (!first.dragging && !first.fixed) {
      first.vx -= impulse * normal.x * inverseFirst;
      first.vy -= impulse * normal.y * inverseFirst;
    }
    if (!second.dragging && !second.fixed) {
      second.vx += impulse * normal.x * inverseSecond;
      second.vy += impulse * normal.y * inverseSecond;
    }
  }

  function resolveRectangleCollision(rectangle, moving) {
    if (moving.dragging || moving.fixed) return;

    const obstacle = opaqueWorldBounds(rectangle);
    const object = opaqueWorldBounds(moving);
    const exits = [
      { distance: object.right - obstacle.left, x: -1, y: 0, dx: obstacle.left - object.right, dy: 0 },
      { distance: obstacle.right - object.left, x: 1, y: 0, dx: obstacle.right - object.left, dy: 0 },
      { distance: object.bottom - obstacle.top, x: 0, y: -1, dx: 0, dy: obstacle.top - object.bottom },
      { distance: obstacle.bottom - object.top, x: 0, y: 1, dx: 0, dy: obstacle.bottom - object.top }
    ];
    const exit = exits.reduce((nearest, candidate) =>
      candidate.distance < nearest.distance ? candidate : nearest
    );

    moving.x += exit.dx;
    moving.y += exit.dy;

    const closingSpeed = moving.vx * exit.x + moving.vy * exit.y;
    if (closingSpeed < 0) {
      const restitution = 0.62;
      moving.vx -= (1 + restitution) * closingSpeed * exit.x;
      moving.vy -= (1 + restitution) * closingSpeed * exit.y;
    }
  }

  function attractBodies(first, second, delta) {
    if (first.fixed || second.fixed) return;

    const firstBounds = opaqueWorldBounds(first);
    const secondBounds = opaqueWorldBounds(second);
    const dx = (secondBounds.left + secondBounds.right - firstBounds.left - firstBounds.right) / 2;
    const dy = (secondBounds.top + secondBounds.bottom - firstBounds.top - firstBounds.bottom) / 2;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.001) return;

    // A softened, capped inverse-square pull keeps the cluster gently lively
    // without allowing close approaches to become violent slingshots.
    const softenedDistanceSquared = dx * dx + dy * dy + 2500;
    const directionX = dx / distance;
    const directionY = dy / distance;
    const firstAcceleration = Math.min(45, 18000 * second.gravitationalMass / softenedDistanceSquared);
    const secondAcceleration = Math.min(45, 18000 * first.gravitationalMass / softenedDistanceSquared);

    if (!first.dragging) {
      first.vx += directionX * firstAcceleration * delta;
      first.vy += directionY * firstAcceleration * delta;
    }
    if (!second.dragging) {
      second.vx -= directionX * secondAcceleration * delta;
      second.vy -= directionY * secondAcceleration * delta;
    }
  }

  function containInViewport(body) {
    const bounds = opaqueWorldBounds(body);
    const bounce = 0.58;

    if (bounds.bottom >= 0) body.enteredViewport = true;

    if (bounds.left < 0) {
      body.x -= bounds.left;
      body.vx = Math.abs(body.vx) * bounce;
    } else if (bounds.right > window.innerWidth) {
      body.x -= bounds.right - window.innerWidth;
      body.vx = -Math.abs(body.vx) * bounce;
    }

    if (body.enteredViewport && bounds.top < 0) {
      body.y -= bounds.top;
      body.vy = Math.abs(body.vy) * bounce;
    } else if (bounds.bottom > window.innerHeight) {
      body.y -= bounds.bottom - window.innerHeight;
      body.vy = -Math.abs(body.vy) * bounce;
      body.vx *= 0.88;
      if (Math.abs(body.vy) < 18) body.vy = 0;
    }
  }

  function render(body) {
    body.image.style.setProperty("--cosmic-x", `${body.x.toFixed(2)}px`);
    body.image.style.setProperty("--cosmic-y", `${body.y.toFixed(2)}px`);
  }

  function beginDrag(event, body) {
    const localX = event.clientX - body.x;
    const localY = event.clientY - body.y;
    if (!solidAt(body, localX, localY)) return;

    event.preventDefault();
    body.dragging = true;
    body.image.setAttribute("aria-grabbed", "true");
    body.image.setPointerCapture(event.pointerId);
    body.dragOffsetX = localX;
    body.dragOffsetY = localY;
    body.lastPointerX = event.clientX;
    body.lastPointerY = event.clientY;
    body.lastPointerTime = performance.now();
    body.vx = 0;
    body.vy = 0;
  }

  function moveDrag(event, body) {
    if (!body.dragging) return;
    event.preventDefault();
    const now = performance.now();
    const elapsed = Math.max(8, now - body.lastPointerTime) / 1000;
    body.vx = Math.max(-1500, Math.min(1500, (event.clientX - body.lastPointerX) / elapsed));
    body.vy = Math.max(-1500, Math.min(1500, (event.clientY - body.lastPointerY) / elapsed));
    body.x = event.clientX - body.dragOffsetX;
    body.y = event.clientY - body.dragOffsetY;
    body.lastPointerX = event.clientX;
    body.lastPointerY = event.clientY;
    body.lastPointerTime = now;
    containInViewport(body);
    render(body);
  }

  function endDrag(event, body) {
    if (!body.dragging) return;
    body.dragging = false;
    body.image.setAttribute("aria-grabbed", "false");
    if (body.image.hasPointerCapture(event.pointerId)) {
      body.image.releasePointerCapture(event.pointerId);
    }
  }

  async function createBody(config, index) {
    const image = new Image();
    image.className = "cosmic-object";
    image.src = config.src;
    image.alt = config.name;
    image.title = config.name;
    image.draggable = false;
    image.setAttribute("aria-grabbed", "false");
    image.style.visibility = "hidden";
    layer.append(image);

    await image.decode().catch(() => new Promise((resolve) => image.addEventListener("load", resolve, { once: true })));

    const side = pageContent && window.innerWidth > 760
      ? (index % 2 === 0 ? "left" : "right")
      : null;
    const contentRect = side ? pageContent.getBoundingClientRect() : null;
    const sideSpace = side === "left"
      ? contentRect.left
      : side === "right"
        ? window.innerWidth - contentRect.right
        : Infinity;
    const width = Math.min(config.width * viewportScale(), Math.max(1, sideSpace - 8));
    const height = width * image.naturalHeight / image.naturalWidth;
    image.style.width = `${width}px`;
    image.style.height = `${height}px`;

    const maskCanvas = document.createElement("canvas");
    const body = {
      ...config,
      image,
      width,
      height,
      x: window.innerWidth / 2 - width / 2,
      y: -height,
      vx: [0, -55, 55, -110, 110, -165, 165, -220, 220][index],
      vy: 500 + Math.abs(index - 4) * 14,
      active: false,
      enteredViewport: false,
      dragging: false,
      maskCanvas,
      maskContext: maskCanvas.getContext("2d", { willReadFrequently: true }),
      mask: new Uint8Array(1),
      maskWidth: 1,
      maskHeight: 1,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      mass: 1,
      lastMaskRefresh: 0
    };

    makeMask(body);
    // On posts, start each object above its assigned side lane. On the home
    // page, keep the original top-center entrance.
    if (side === "left") {
      body.x = Math.floor(contentRect.left) - body.bounds.maxX - 5;
    } else if (side === "right") {
      body.x = Math.ceil(contentRect.right) + 4 - body.bounds.minX;
    } else {
      body.x = window.innerWidth / 2 - (body.bounds.minX + body.bounds.maxX + 1) / 2;
    }
    body.y = -body.bounds.minY;
    image.addEventListener("pointerdown", (event) => beginDrag(event, body));
    image.addEventListener("pointermove", (event) => moveDrag(event, body));
    image.addEventListener("pointerup", (event) => endDrag(event, body));
    image.addEventListener("pointercancel", (event) => endDrag(event, body));
    bodies.push(body);
    render(body);
    return body;
  }

  async function createSceneryCollider(image, name) {
    await image.decode().catch(() => new Promise((resolve) => image.addEventListener("load", resolve, { once: true })));

    const maskCanvas = document.createElement("canvas");
    const body = {
      name,
      image,
      width: 1,
      height: 1,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      active: true,
      fixed: true,
      dragging: false,
      maskCanvas,
      maskContext: maskCanvas.getContext("2d", { willReadFrequently: true }),
      mask: new Uint8Array(1),
      maskWidth: 1,
      maskHeight: 1,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      mass: Infinity
    };

    syncSceneryCollider(body, true);
    bodies.push(body);
    return body;
  }

  function createRectangleCollider(rectProvider, name) {
    const body = {
      name,
      image: null,
      width: 0,
      height: 0,
      x: -10000,
      y: -10000,
      vx: 0,
      vy: 0,
      active: true,
      fixed: true,
      rectangle: true,
      rectProvider,
      dragging: false,
      mask: new Uint8Array(1),
      maskWidth: 1,
      maskHeight: 1,
      bounds: { minX: 0, minY: 0, maxX: -1, maxY: -1 },
      mass: Infinity
    };

    syncSceneryCollider(body, true);
    bodies.push(body);
    return body;
  }

  function syncSceneryCollider(body, forceMask = false) {
    const rect = body.rectProvider
      ? body.rectProvider()
      : body.image.getBoundingClientRect();
    const left = body.rectProvider ? Math.max(0, Math.floor(rect.left)) : rect.left;
    const top = body.rectProvider ? Math.max(0, Math.floor(rect.top)) : rect.top;
    const right = body.rectProvider ? Math.min(window.innerWidth, Math.ceil(rect.right)) : Math.ceil(rect.right);
    const bottom = body.rectProvider ? Math.min(window.innerHeight, Math.ceil(rect.bottom)) : Math.ceil(rect.bottom);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    const sizeChanged = width !== body.width || height !== body.height;

    body.x = width && height ? left : -10000;
    body.y = width && height ? top : -10000;
    body.width = width;
    body.height = height;
    if (forceMask || sizeChanged) {
      if (body.rectangle) makeRectangleMask(body);
      else makeMask(body);
    }
  }

  function step(delta, now) {
    const activeBodies = bodies.filter((body) => body.active);
    const substeps = 3;
    const subDelta = delta / substeps;

    for (const body of activeBodies) {
      if (body.fixed) syncSceneryCollider(body);
      if (body.animated && now - body.lastMaskRefresh > 250) {
        makeMask(body);
        body.lastMaskRefresh = now;
      }
    }

    // Gravity changes slowly enough to calculate once per rendered physics
    // frame instead of repeating the same pair calculations in every substep.
    for (let firstIndex = 0; firstIndex < activeBodies.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < activeBodies.length; secondIndex += 1) {
        attractBodies(activeBodies[firstIndex], activeBodies[secondIndex], delta);
      }
    }

    for (let substep = 0; substep < substeps; substep += 1) {
      for (const body of activeBodies) {
        if (body.dragging || body.fixed) continue;
        // Space mode: preserve velocity without downward gravity or air drag.
        body.x += body.vx * subDelta;
        body.y += body.vy * subDelta;
        containInViewport(body);
      }

      for (let firstIndex = 0; firstIndex < activeBodies.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < activeBodies.length; secondIndex += 1) {
          const first = activeBodies[firstIndex];
          const second = activeBodies[secondIndex];
          if (pixelsOverlap(first, second)) resolveCollision(first, second);
        }
      }
    }

    for (const body of activeBodies) {
      if (!body.fixed) render(body);
    }
  }

  function animate(now) {
    if (now - previousTime < frameInterval) {
      requestAnimationFrame(animate);
      return;
    }
    const delta = Math.min(frameInterval / 1000, Math.max(0, (now - previousTime) / 1000));
    previousTime = now;
    step(delta, now);
    requestAnimationFrame(animate);
  }

  const pageColliders = pageContent && pageHeader
    ? [
        createRectangleCollider(() => window.innerWidth <= 760
          ? { left: 0, right: 0, top: 0, bottom: 0 }
          : pageContent.getBoundingClientRect(), "page content"),
        createRectangleCollider(() => {
          if (window.innerWidth <= 760) {
            return { left: 0, right: 0, top: 0, bottom: 0 };
          }
          const contentRect = pageContent.getBoundingClientRect();
          const headerRect = pageHeader.getBoundingClientRect();
          return {
            left: contentRect.left,
            right: contentRect.right,
            top: headerRect.top,
            bottom: headerRect.bottom
          };
        }, "page header")
      ]
    : [];

  Promise.all([
    Promise.all(objects.map(createBody)),
    earth ? createSceneryCollider(earth, "terra") : Promise.resolve(null),
    Promise.resolve(pageColliders)
  ]).then(([createdBodies]) => {
    // Start every delay from the same instant so the launch order is guaranteed,
    // regardless of which image happened to decode first.
    for (const body of createdBodies) {
      window.setTimeout(() => {
        body.active = true;
        body.image.style.visibility = "visible";
      }, body.delay);
    }
    requestAnimationFrame(animate);
  });
})();
