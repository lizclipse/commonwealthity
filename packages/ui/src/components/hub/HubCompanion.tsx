import { useTransContext } from "@mbarzda/solid-i18next";
import { type Accessor, createSignal, type Setter } from "solid-js";
import {
  clamp,
  useElementSize,
  useMouse,
  useMousePressed,
  useRafFn,
  useWindowSize,
} from "solidjs-use";
import HubButton from "./HubButton";
import styles from "./HubCompanion.module.scss";

const acc = 1.2;
const friction = 0.08;
const minDist = 0.3;
const minVel = 0.001;
const absoluteMax = 10_000;

function minDrag() {
  return matchMedia("(pointer: coarse)").matches ? 30 : 5;
}

function adjustAcc(acc: number, absDist: number): number {
  return absDist <= minDist * 10
    ? acc * Math.min((Math.log(absDist + 0.2) + 2) / 3, 1)
    : acc;
}

function fixNumber(n: number, name: string): number {
  return isNaN(n) ? (console.warn(name, "is NaN"), 0) : n;
}

type Vec2 = readonly [x: number, y: number];
type Quad = readonly [
  distance: number,
  appliedAcc: Vec2,
  base: Vec2,
  name: string
];

interface ThrowableInit {
  onClick?: (() => void) | undefined;
  x: Accessor<number>;
  setX: Setter<number>;
  y: Accessor<number>;
  setY: Setter<number>;
}

function motion({ onClick, x, setX, y, setY }: ThrowableInit) {
  const { width: screenWidth, height: screenHeight } = useWindowSize();
  const [el, setEl] = createSignal<HTMLButtonElement>();
  const { width: buttonWidth, height: buttonHeight } = useElementSize(el);
  const { x: mouseX, y: mouseY } = useMouse();
  const { pressed } = useMousePressed();
  const [containerDisplay, setContainerDisplay] = createSignal<"block">();

  const [mouseDrag, setMouseDrag] = createSignal<{
    dragging: boolean;
    startX: number;
    startY: number;
  }>();

  const startDragging = () => {
    setMouseDrag({
      dragging: false,
      startX: mouseX(),
      startY: mouseY(),
    });
  };

  const minX = () => buttonWidth() / 2;
  const minY = () => buttonHeight() / 2;
  const maxX = () => screenWidth() - buttonWidth() / 2;
  const maxY = () => screenHeight() - buttonHeight() / 2;

  let vel: Vec2 = [0, 0];
  let current: Vec2 = [x(), y()];

  useRafFn(({ delta }) => {
    const prev = current;

    const drag = mouseDrag();
    if (drag) {
      const { dragging, startX, startY } = drag;

      if (!pressed()) {
        setMouseDrag(undefined);
        if (!dragging) onClick?.();
        return;
      }

      const [px, py] = prev;
      const [cx, cy] = (current = [mouseX(), mouseY()]);

      if (!dragging) {
        const dist = Math.sqrt(
          Math.pow(cx - startX, 2) + Math.pow(cy - startY, 2)
        );

        if (dist < minDrag()) return;
        setMouseDrag({ dragging: true, startX, startY });
      }

      vel = [cx - px, cy - py];
      setX(cx);
      setY(cy);
      return;
    }

    const currX = fixNumber(x(), "x");
    const currY = fixNumber(y(), "y");

    // Define the quadrants and the acceleration.
    // This is essentially the gravity for each quadrant.
    const quads: Quad[] = [
      [currX - minX(), [-acc, 0], [0, 1], "left"],
      [maxX() - currX, [acc, 0], [0, 1], "right"],
      [currY - minY(), [0, -acc], [1, 0], "top"],
      [maxY() - currY, [0, acc], [1, 0], "bottom"],
    ];

    ({ vel } = quads.reduce(
      (prev, [dist, [accX, accY], [baseX, baseY]]) => {
        if (dist > prev.dist) return prev;

        const [velX, velY] = vel;
        // Zero the velocity if we're close enough to the boundary.
        const absDist = Math.abs(dist);
        const applyMinimums = (v: number, base: number): number =>
          Math.abs(v) < minVel ? 0 : absDist < minDist ? v * base : v;

        // Apply the sign since the acceleration should point towards the boundary.
        const s = Math.sign(dist);
        return {
          vel: [
            applyMinimums(velX + adjustAcc(accX, absDist) * s, baseX),
            applyMinimums(velY + adjustAcc(accY, absDist) * s, baseY),
          ],
          dist,
        } as const;
      },
      {
        vel,
        dist: Infinity,
      }
    ));

    // Apply friction.
    vel = vel.map((v) => v * (1 - friction)) as unknown as Vec2;

    // Apply velocity.
    const [vx, vy] = vel;
    current = [
      setX(
        clamp(
          currX + vx * delta * 0.1,
          -absoluteMax,
          absoluteMax + screenWidth()
        )
      ),
      setY(
        clamp(
          currY + vy * delta * 0.1,
          -absoluteMax,
          absoluteMax + screenHeight()
        )
      ),
    ];

    if (!containerDisplay()) {
      setContainerDisplay("block");
    }
  });

  return { setEl, startDragging, containerDisplay };
}

export interface HubCompanionProps extends ThrowableInit {
  hidden: Accessor<boolean>;
}

export default function HubCompanion({
  x,
  y,
  hidden,
  ...props
}: HubCompanionProps) {
  const { setEl, startDragging, containerDisplay } = motion({ x, y, ...props });
  const [t] = useTransContext();

  return (
    <div class={styles.hub} style={{ display: containerDisplay() }}>
      <HubButton
        ref={setEl}
        title={t("nav.openHub")}
        style={{
          left: `${x()}px`,
          top: `${y()}px`,
          visibility: hidden() ? "hidden" : "visible",
        }}
        onMouseDown={startDragging}
        onTouchStart={startDragging}
      />
    </div>
  );
}
