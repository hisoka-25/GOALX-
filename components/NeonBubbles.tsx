// Bulles néon décoratives façon eFootball : cercles lumineux nets,
// de différentes tailles et couleurs, fixés sur le viewport.
// Purement décoratif (aucune interaction), placé derrière le contenu.

type Bubble = {
  size: number;
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  color: "cyan" | "magenta" | "blue" | "white";
  opacity?: number;
};

const gradient: Record<
  Bubble["color"],
  { core: string; glow: string }
> = {
  cyan: {
    core: "radial-gradient(circle at 34% 30%, #ffffff 0%, #bdf3ff 20%, #34d8ff 58%, rgba(52,216,255,0) 74%)",
    glow: "rgba(52,216,255,0.75)"
  },
  magenta: {
    core: "radial-gradient(circle at 34% 30%, #ffffff 0%, #ffd2f4 20%, #ff2fd0 58%, rgba(255,47,208,0) 74%)",
    glow: "rgba(255,47,208,0.7)"
  },
  blue: {
    core: "radial-gradient(circle at 34% 30%, #dfeaff 0%, #a9c2ff 22%, #3d6bff 60%, rgba(61,107,255,0) 76%)",
    glow: "rgba(61,107,255,0.7)"
  },
  white: {
    core: "radial-gradient(circle at 36% 32%, #ffffff 0%, #d6fbff 45%, rgba(180,235,255,0.2) 70%, rgba(180,235,255,0) 78%)",
    glow: "rgba(190,240,255,0.8)"
  }
};

const bubbles: Bubble[] = [
  { size: 190, top: "92px", right: "-46px", color: "cyan" },
  { size: 120, top: "300px", left: "-36px", color: "magenta" },
  { size: 96, top: "46%", right: "5%", color: "blue" },
  { size: 200, bottom: "-70px", right: "16%", color: "magenta", opacity: 0.9 },
  { size: 70, bottom: "16%", left: "300px", color: "cyan" },
  { size: 44, top: "200px", right: "30%", color: "white", opacity: 0.85 },
  { size: 56, bottom: "10%", right: "34%", color: "blue", opacity: 0.8 },
  { size: 36, top: "150px", left: "340px", color: "magenta", opacity: 0.75 },
  { size: 48, bottom: "34%", right: "-12px", color: "white", opacity: 0.7 }
];

export default function NeonBubbles() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0
      }}
    >
      {bubbles.map((b, i) => {
        const g = gradient[b.color];
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              width: b.size,
              height: b.size,
              top: b.top,
              bottom: b.bottom,
              left: b.left,
              right: b.right,
              borderRadius: "50%",
              background: g.core,
              opacity: b.opacity ?? 1,
              filter: "blur(0.5px)",
              boxShadow: `0 0 ${Math.round(b.size * 0.28)}px ${g.glow}, 0 0 ${Math.round(b.size * 0.6)}px ${g.glow.replace("0.7", "0.35").replace("0.75", "0.4").replace("0.8", "0.4")}`
            }}
          />
        );
      })}
    </div>
  );
}
