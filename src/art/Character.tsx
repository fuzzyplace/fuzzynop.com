/**
 * The hero character: an original ink silhouette of Z — short sides, textured quiff,
 * rectangular glasses (the only thing that catches light), short beard.
 * Local origin = grip point at the back of the collar. Faces +x.
 */
export type Pose = { swing: number; dangle: number; facing: 1 | -1; squash: number };

export function Character({ x, y, scale = 1, pose }: { x: number; y: number; scale?: number; pose: Pose }) {
  const { swing, dangle, facing, squash } = pose;
  const legA = dangle * 0.35; // legs drift apart while carried
  const armA = dangle * 0.5;
  return (
    <g transform={`translate(${x} ${y}) rotate(${(swing * 180) / Math.PI}) scale(${facing * scale} ${scale * (1 - squash)})`}>
      <g filter="url(#ink)">
        {/* legs */}
        <path d={`M-3 2 L${-5 - legA * 10} 26 L${-2 - legA * 10} 26 L-0.5 4 Z`} className="fill-ink" />
        <path d={`M3 2 L${4 + legA * 9} 26 L${7 + legA * 9} 26 L5.5 3 Z`} className="fill-ink" />
        {/* torso — blazer silhouette */}
        <path d="M-8 -9 C-9 -4,-7 4,-6 6 L7 6 C8 2,9 -4,8 -9 C5 -11,-5 -11,-8 -9 Z" className="fill-ink" />
        {/* arms */}
        <path d={`M-7 -7 L${-9 - armA * 6} ${8 - armA * 4}`} className="stroke-ink" strokeWidth="3" strokeLinecap="round" />
        <path d={`M7 -7 L${9 + armA * 6} ${8 - armA * 4}`} className="stroke-ink" strokeWidth="3" strokeLinecap="round" />
        {/* neck */}
        <rect x="-2.5" y="-14" width="5" height="6" className="fill-ink" />
        {/* head: skull, short sides, textured quiff, nose, beard */}
        <path
          className="fill-ink"
          d="M-9 -18 C-12 -24,-11 -32,-6 -35 L-8 -37 L-4 -37.5 L-6 -40 L-1 -39 L-2 -42.5 L3 -40 L3.5 -43 L7 -39.5 L9.5 -41 L10 -36.5 C11.5 -34,11.5 -31,11 -28 L13 -24.5 L11 -23.5 C11.5 -21,11 -19.5,10.5 -18.5 C10.5 -16,9 -13.5,6 -12.5 C2 -11.5,-2 -13,-4 -14.5 L-6 -16 Z"
        />
        {/* beard stubble breaking the jaw line */}
        <path d="M10 -16 L11.4 -15.4 M8 -13.2 L9 -12 M5 -12.4 L5.5 -11 M2 -12.2 L2 -10.9" className="stroke-ink" strokeWidth="0.9" strokeLinecap="round" />
      </g>
      {/* glasses — rectangular frames catch the light */}
      <rect x="4.6" y="-30.2" width="6.6" height="4.6" rx="0.9" fill="none" className="stroke-gray-300" strokeWidth="1.1" />
      <path d="M4.6 -28.4 L-3 -29.2" className="stroke-gray-500" strokeWidth="0.9" />
      <path d="M6 -29.2 L7.6 -29.2" className="stroke-gray-100" strokeWidth="0.7" strokeLinecap="round" />
    </g>
  );
}
