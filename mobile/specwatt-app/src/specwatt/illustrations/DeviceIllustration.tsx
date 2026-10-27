import React, { useId } from "react";
import { Platform, StyleProp, ViewStyle } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  G,
  Path,
  Rect,
  Circle,
  Ellipse,
  Line,
  Text as SvgText,
} from "react-native-svg";
import {
  deviceCatalog,
  defaultIllustration,
  illustrationColors,
  validateIllustrationConfig,
} from "./catalog";
import type { IllustrationConfig, VisualFamily } from "./catalog";

export type DeviceIllustrationProps = {
  config?: IllustrationConfig;
  width?: number | string;
  height?: number | string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};
/** Original SpecWATT vector artwork. Only fixed local primitives and validated palette choices. */
export function DeviceIllustration({
  config,
  width = 240,
  height = 200,
  style,
  accessibilityLabel,
}: DeviceIllustrationProps) {
  const safe = validateIllustrationConfig(config) ?? defaultIllustration();
  const item = deviceCatalog.find((x) => x.id === safe.categoryId)!;
  const prefix = `sw${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const paint = (name: string) => `url(#${prefix}${name})`;
  const body = paint("body"),
    edge = paint("edge"),
    glass = paint("glass"),
    warm = paint("warm"),
    metal = paint("metal"),
    glow = paint("glow");
  const r = safe.variant === "rounded" ? 16 : 4,
    detail = safe.details === "detailed",
    f = item.form;
  const vents = (x: number, y: number, count = 6, w = 55) => (
    <G>
      {Array.from({ length: count }, (_, i) => (
        <Rect
          key={i}
          x={x}
          y={y + i * 5}
          width={w}
          height={1.6}
          rx={0.8}
          fill="#0C0F0D"
          opacity={0.55}
        />
      ))}
    </G>
  );
  const button = (x: number, y: number) => (
    <G>
      <Circle
        cx={x}
        cy={y}
        r={4.5}
        fill="#151B18"
        stroke="#8C9386"
        strokeWidth={1}
      />
      <Circle cx={x} cy={y} r={1.6} fill="#FFA86B" />
    </G>
  );
  const feet = (x = 85, y = 206, w = 150) => (
    <G>
      <Rect x={x} y={y} width={22} height={7} rx={2} fill="#0D100E" />
      <Rect x={x + w - 22} y={y} width={22} height={7} rx={2} fill="#0D100E" />
    </G>
  );
  const panel = (x: number, y: number, w: number, h: number) => (
    <Rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={r}
      fill={body}
      stroke="#888E80"
      strokeOpacity={0.6}
      strokeWidth={1.2}
    />
  );
  const smallDisplay = (x: number, y: number, w = 45) => (
    <G>
      <Rect
        x={x}
        y={y}
        width={w}
        height={19}
        rx={4}
        fill="#111A16"
        stroke="#798574"
        strokeWidth={0.6}
      />
      <Path
        d={`M${x + 8} ${y + 7}h${w - 16}m-${w - 16} 5h${w - 22}`}
        stroke="#D7BC8C"
        strokeWidth={1.3}
      />
    </G>
  );
  let art: React.ReactNode;
  switch (item.family as VisualFamily) {
    case "lamp": {
      const floor = f === 2,
        reading = f === 4,
        night = f === 5;
      art = reading ? (
        <G>
          <Path
            d="M142 190L188 95 132 55"
            stroke={metal}
            strokeWidth={9}
            fill="none"
          />
          <Circle cx={188} cy={95} r={8} fill={body} />
          <Path d="M103 49l39-10 23 27-64 16Z" fill={body} stroke="#BBA987" />
          <Ellipse cx={130} cy={73} rx={30} ry={8} fill={warm} />
          <Ellipse cx={148} cy={201} rx={48} ry={8} fill={metal} />
        </G>
      ) : (
        <G>
          <Ellipse
            cx={160}
            cy={207}
            rx={72}
            ry={12}
            fill="#FFB65D"
            opacity={0.09}
          />
          <Path
            d={
              floor
                ? "M153 99h14l2 105h-18Z"
                : night
                  ? "M143 110h34l12 88h-58Z"
                  : "M148 102h24l13 95h-50Z"
            }
            fill={floor ? metal : body}
          />
          <Ellipse
            cx={160}
            cy={200}
            rx={floor ? 40 : 36}
            ry={8}
            fill={body}
            stroke="#E0C190"
            strokeWidth={0.7}
          />
          <Path
            d={
              safe.variant === "angular"
                ? "M73 129L111 50h98l38 79Z"
                : night
                  ? "M102 131C102 38 218 38 218 131Z"
                  : "M66 129C66 9 254 9 254 129Z"
            }
            fill={body}
            stroke="#F1D5A7"
            strokeWidth={1.2}
          />
          <Path
            d={
              night
                ? "M104 129C130 124 190 124 216 129"
                : "M68 127C112 116 208 116 252 127"
            }
            fill="none"
            stroke="#FFCE83"
            strokeWidth={4}
          />
          <Ellipse cx={160} cy={130} rx={night ? 56 : 93} ry={8} fill={warm} />
          <Path d="M153 141h14l6 49h-26Z" fill="#F8D8A2" opacity={0.42} />
          <Path
            d={
              safe.variant === "angular"
                ? "M88 111L117 58h80"
                : night
                  ? "M115 99C123 66 144 57 159 57"
                  : "M84 96C94 51 125 35 160 34"
            }
            stroke="#FFF2D4"
            strokeWidth={2}
            opacity={0.4}
            fill="none"
          />
        </G>
      );
      break;
    }
    case "led": {
      art =
        f === 2 ? (
          <G>
            <Path
              d="M49 156L259 91l14 20-211 67Z"
              fill={metal}
              stroke="#DAAF70"
            />
            {Array.from({ length: 15 }, (_, i) => (
              <Rect
                key={i}
                x={57 + i * 13.7}
                y={148 - i * 4.25}
                width={8}
                height={12}
                rx={2}
                fill={warm}
              />
            ))}
          </G>
        ) : (
          <G>
            <Ellipse
              cx={159}
              cy={193}
              rx={126}
              ry={19}
              fill="#D89B4A"
              opacity={0.12}
            />
            {[
              { rx: 111, ry: 48, y: 131 },
              { rx: 87, ry: 37, y: 117 },
              { rx: 60, ry: 26, y: 104 },
            ].map((coil, ci) => (
              <G key={ci}>
                <Ellipse
                  cx={160}
                  cy={coil.y + 9}
                  rx={coil.rx}
                  ry={coil.ry}
                  fill="none"
                  stroke="#5D4229"
                  strokeWidth={19}
                />
                <Ellipse
                  cx={160}
                  cy={coil.y}
                  rx={coil.rx}
                  ry={coil.ry}
                  fill="none"
                  stroke={metal}
                  strokeWidth={17}
                />
                <Ellipse
                  cx={160}
                  cy={coil.y - 4}
                  rx={coil.rx}
                  ry={coil.ry}
                  fill="none"
                  stroke="#E8C58D"
                  strokeWidth={1}
                  opacity={0.8}
                />
                {Array.from({ length: ci === 2 ? 15 : 23 }, (_, i) => {
                  const a = (i / (ci === 2 ? 15 : 23)) * Math.PI * 2;
                  const x = 160 + Math.cos(a) * coil.rx,
                    y = coil.y + Math.sin(a) * coil.ry;
                  return (
                    <G
                      key={i}
                      transform={`translate(${x} ${y}) rotate(${Math.cos(a) * 25})`}
                    >
                      <Rect
                        x={-5.5}
                        y={-4}
                        width={11}
                        height={8}
                        rx={1.3}
                        fill="#675B3D"
                      />
                      <Rect
                        x={-3.8}
                        y={-3.1}
                        width={7.6}
                        height={6.2}
                        rx={1}
                        fill={warm}
                      />
                      {detail && (
                        <>
                          <Line
                            x1={-10}
                            x2={-8}
                            y1={0}
                            y2={0}
                            stroke="#33291F"
                            strokeWidth={2}
                          />
                          <Line
                            x1={8}
                            x2={10}
                            y1={0}
                            y2={0}
                            stroke="#33291F"
                            strokeWidth={2}
                          />
                        </>
                      )}
                    </G>
                  );
                })}
              </G>
            ))}
            <Path
              d="M257 149C280 162 269 191 237 198L218 203"
              stroke="#A9854D"
              strokeWidth={16}
              fill="none"
            />
            <Path
              d="M256 147C276 163 266 184 236 194L217 199"
              stroke="#EDD3A1"
              strokeWidth={11}
              fill="none"
            />
            {[0, 1, 2, 3].map((i) => (
              <Rect
                key={i}
                x={219 + i * 12}
                y={192 - i * 4}
                width={7}
                height={6}
                rx={1}
                fill={warm}
              />
            ))}
          </G>
        );
      break;
    }
    case "fan": {
      const hardware = f === 0 || f === 3;
      art = (
        <G>
          {hardware && (
            <>
              <Path
                d="M85 166C57 181 62 204 34 211"
                stroke="#70252A"
                strokeWidth={4}
                fill="none"
              />
              <Path
                d="M86 171C60 187 64 207 39 217"
                stroke="#101311"
                strokeWidth={4}
                fill="none"
              />
            </>
          )}
          {!hardware && (
            <>
              <Path d="M152 134h16l9 65h-34Z" fill={metal} />
              <Ellipse cx={160} cy={203} rx={48} ry={8} fill={body} />
            </>
          )}
          <G transform={hardware ? "rotate(-7 160 121)" : ""}>
            {hardware && (
              <>
                <Rect
                  x={76}
                  y={34}
                  width={170}
                  height={170}
                  rx={10}
                  fill={edge}
                  stroke="#6F7667"
                  strokeWidth={2}
                />
                <Rect
                  x={84}
                  y={42}
                  width={154}
                  height={154}
                  rx={8}
                  fill="#151A16"
                  stroke="#070C08"
                  strokeWidth={3}
                />
              </>
            )}
            <Circle
              cx={160}
              cy={119}
              r={hardware ? 74 : 68}
              fill="#171D18"
              stroke={metal}
              strokeWidth={hardware ? 7 : 5}
            />
            {Array.from({ length: 7 }, (_, i) => (
              <Path
                key={i}
                d="M154 115C118 113 104 79 131 55C154 43 150 83 169 104Z"
                fill={i % 2 ? body : metal}
                stroke="#4E5749"
                strokeWidth={0.7}
                transform={`rotate(${(i * 360) / 7} 160 119)`}
              />
            ))}
            <Circle
              cx={160}
              cy={119}
              r={24}
              fill={edge}
              stroke="#7F806A"
              strokeWidth={1.5}
            />
            <Circle cx={160} cy={119} r={18} fill={body} />
            <Circle cx={154} cy={113} r={9} fill="#ACB6A1" opacity={0.11} />
            {hardware
              ? [
                  [88, 46],
                  [232, 46],
                  [88, 190],
                  [232, 190],
                ].map(([x, y]) => (
                  <G key={`${x}${y}`}>
                    <Circle
                      cx={x}
                      cy={y}
                      r={5}
                      fill="#111611"
                      stroke="#ACAA8D"
                      strokeWidth={1.3}
                    />
                    <Path
                      d={`M${x - 2} ${y - 2}l4 4m-4 0l4-4`}
                      stroke="#8C8A75"
                      strokeWidth={1}
                    />
                  </G>
                ))
              : detail && (
                  <G>
                    {Array.from({ length: 8 }, (_, i) => (
                      <Ellipse
                        key={i}
                        cx={160}
                        cy={119}
                        rx={12 + i * 7}
                        ry={12 + i * 7}
                        stroke="#A5AB97"
                        strokeWidth={0.5}
                        opacity={0.55}
                        fill="none"
                      />
                    ))}
                  </G>
                )}
          </G>
        </G>
      );
      break;
    }
    case "bulb":
      art = (
        <G>
          <Path
            d={
              f === 2
                ? "M160 28C134 66 112 84 121 112C125 126 140 133 144 157h32c4-24 19-31 23-45C208 84 185 66 160 28Z"
                : "M144 157C143 138 111 119 111 87a49 49 0 0 1 98 0c0 32-32 51-33 70Z"
            }
            fill={body}
            stroke="#DAC293"
          />
          <Ellipse cx={160} cy={111} rx={36} ry={36} fill={glow} />
          <Path
            d="M145 153l-8-53 15 9 16-16 15 7-10 53"
            stroke="#FFBD70"
            fill="none"
            strokeWidth={2}
          />
          <Path d="M143 157h34v30l-12 12h-10l-12-12Z" fill={metal} />
          {[164, 171, 178, 185].map((y) => (
            <Line
              key={y}
              x1={143}
              x2={177}
              y1={y}
              y2={y - 3}
              stroke="#31392F"
              strokeWidth={3}
            />
          ))}
        </G>
      );
      break;
    case "pendant":
      art = (
        <G>
          <Path d="M160 10v58" stroke={metal} strokeWidth={4} />
          {f === 1 ? (
            <G>
              {[-1, 0, 1].map((i) => (
                <G key={i}>
                  <Path
                    d={`M160 63Q${160 + i * 66} 90 ${160 + i * 66} 106`}
                    fill="none"
                    stroke={metal}
                    strokeWidth={4}
                  />
                  <Path
                    d={`M${130 + i * 66} 141q0-54 30-54t30 54Z`}
                    fill={body}
                  />
                  <Ellipse
                    cx={160 + i * 66}
                    cy={141}
                    rx={29}
                    ry={7}
                    fill={warm}
                  />
                </G>
              ))}
            </G>
          ) : (
            <G>
              <Path
                d="M67 157Q86 65 160 66Q234 65 253 157Z"
                fill={body}
                stroke="#B8AB8C"
              />
              <Ellipse cx={160} cy={156} rx={91} ry={14} fill={warm} />
              <Ellipse cx={160} cy={156} rx={74} ry={9} fill="#FFE5A8" />
            </G>
          )}
        </G>
      );
      break;
    case "spotlight":
      art = (
        <G>
          {f === 1 ? (
            <>
              <Rect x={45} y={48} width={230} height={8} rx={3} fill={metal} />
              {[91, 160, 229].map((x) => (
                <G key={x}>
                  <Path d={`M${x} 55v35`} stroke={metal} strokeWidth={7} />
                  <Rect
                    x={x - 19}
                    y={83}
                    width={38}
                    height={69}
                    rx={8}
                    fill={body}
                  />
                  <Ellipse cx={x} cy={151} rx={19} ry={8} fill={warm} />
                </G>
              ))}
            </>
          ) : (
            <>
              <Path
                d="M148 73h24v-26h-24ZM136 171l-25 32h98l-25-32"
                fill={metal}
              />
              <Rect
                x={89}
                y={66}
                width={142}
                height={106}
                rx={r}
                fill={body}
                stroke="#8F9787"
              />
              <Rect
                x={102}
                y={78}
                width={116}
                height={79}
                rx={8}
                fill={warm}
                stroke="#262E25"
                strokeWidth={6}
              />
              {detail && (
                <Path
                  d="M111 90h98m-98 14h98m-98 14h98m-98 14h98"
                  stroke="#E3B779"
                  strokeWidth={1}
                />
              )}
            </>
          )}
        </G>
      );
      break;
    case "ceilingfan":
      art = (
        <G>
          <Ellipse cx={160} cy={206} rx={77} ry={9} fill="#000" opacity={0.1} />
          <Path d="M160 34v61" stroke={metal} strokeWidth={10} />
          {[0, 1, 2, 3].map((i) => (
            <Path
              key={i}
              d="M152 106Q103 71 53 84L52 109Q103 133 155 122Z"
              fill={body}
              stroke="#93816A"
              transform={`rotate(${i * 90} 160 117)`}
            />
          ))}
          <Circle cx={160} cy={117} r={27} fill={metal} />
          <Ellipse cx={160} cy={124} rx={23} ry={14} fill={warm} />
        </G>
      );
      break;
    case "ac":
      art = (
        <G>
          {panel(39, 67, 242, 85)}
          <Path d="M49 128h222l-8 17H56Z" fill="#131B15" />
          <Path d="M54 136h211M60 141h199" stroke="#797E6D" />
          {button(261, 88)}
          {f === 1 ? (
            <>
              {panel(81, 156, 158, 51)}
              {vents(104, 168, 5, 99)}
            </>
          ) : (
            <>
              <Path
                d="M104 166q-14 17 0 34m56-34q-14 17 0 34m56-34q-14 17 0 34"
                stroke="#AFBDB1"
                opacity={0.4}
                strokeWidth={3}
                fill="none"
              />
            </>
          )}
        </G>
      );
      break;
    case "heater":
      art =
        f === 3 ? (
          <G>
            {panel(59, 70, 202, 128)}
            <Rect x={72} y={82} width={176} height={96} rx={5} fill="#151412" />
            <Path
              d="M106 160q-20-29 5-55-5 28 18 24 24-33 30-28 21 25 24 48 22-13 24-32 21 33-1 49Z"
              fill={warm}
            />
            {feet(67, 200, 186)}
          </G>
        ) : (
          <G>
            {panel(65, 65, 190, 133)}
            <Rect x={76} y={82} width={167} height={91} rx={7} fill="#171F18" />
            {Array.from({ length: 10 }, (_, i) => (
              <Line
                key={i}
                x1={86 + i * 16}
                x2={86 + i * 16}
                y1={88}
                y2={167}
                stroke={f === 2 ? "#FFA461" : "#73816B"}
                strokeWidth={f === 2 ? 5 : 3}
              />
            ))}
            {button(230, 185)}
            {feet(74, 198, 174)}
          </G>
        );
      break;
    case "radiator":
      art = (
        <G>
          {Array.from({ length: 8 }, (_, i) => (
            <G key={i}>
              <Rect
                x={63 + i * 23}
                y={60}
                width={19}
                height={137}
                rx={8}
                fill={body}
                stroke="#9D9F8F"
              />
              <Line
                x1={70 + i * 23}
                x2={70 + i * 23}
                y1={72}
                y2={181}
                stroke="#EFF3DB"
                opacity={0.2}
              />
            </G>
          ))}
          <Rect x={243} y={88} width={23} height={95} rx={5} fill={body} />
          {button(254, 106)}
          {feet(71, 199, 177)}
        </G>
      );
      break;
    case "boiler":
      art = (
        <G>
          <Rect
            x={f === 1 ? 103 : 105}
            y={37}
            width={f === 1 ? 114 : 110}
            height={166}
            rx={f === 1 ? r : 45}
            fill={body}
            stroke="#9A9C8C"
          />
          <Ellipse
            cx={160}
            cy={46}
            rx={43}
            ry={7}
            fill="#D7DECC"
            opacity={0.12}
          />
          {smallDisplay(137, 140)}
          <Path d="M138 204v16m45-16v16" stroke={metal} strokeWidth={8} />
          <Path
            d="M130 61v62"
            stroke="#EDF0DA"
            strokeWidth={3}
            opacity={0.25}
          />
        </G>
      );
      break;
    case "tv":
    case "monitor":
      art = (
        <G>
          <Path d="M151 168h18l10 34h-38Z" fill={metal} />
          <Ellipse cx={160} cy={206} rx={58} ry={5} fill={metal} />
          <Rect
            x={item.family === "tv" ? 29 : 41}
            y={43}
            width={item.family === "tv" ? 262 : 238}
            height={135}
            rx={f === 1 ? 12 : 6}
            fill="#151C16"
            stroke="#79816E"
            strokeWidth={2}
          />
          <Rect
            x={item.family === "tv" ? 35 : 47}
            y={49}
            width={item.family === "tv" ? 250 : 226}
            height={120}
            rx={3}
            fill={glass}
          />
          <Path
            d="M48 159L143 70l54 58 34-25 40 56Z"
            fill="#3D4C41"
            opacity={0.65}
          />
          <Circle cx={228} cy={80} r={21} fill="#D5A775" opacity={0.43} />
          <Circle cx={160} cy={174} r={1.5} fill="#FFAC70" />
        </G>
      );
      break;
    case "fridge":
      art = (
        <G>
          {panel(f === 1 ? 76 : 94, 28, f === 1 ? 168 : 132, 179)}
          {f === 1 ? (
            <>
              <Line
                x1={160}
                x2={160}
                y1={35}
                y2={200}
                stroke="#303A30"
                strokeWidth={3}
              />
              <Path d="M147 74v45m26-45v45" stroke="#C4C9B9" strokeWidth={4} />
            </>
          ) : (
            <>
              <Line
                x1={99}
                x2={221}
                y1={f === 2 ? 97 : 88}
                y2={f === 2 ? 97 : 88}
                stroke="#303A30"
                strokeWidth={3}
              />
              <Path d="M207 58v18m0 28v34" stroke="#CED1C0" strokeWidth={4} />
            </>
          )}
          {f === 4 && (
            <>
              <Rect
                x={110}
                y={52}
                width={100}
                height={132}
                rx={4}
                fill={glass}
              />
              {[78, 108, 138, 168].map((y) => (
                <Line
                  key={y}
                  x1={119}
                  x2={201}
                  y1={y}
                  y2={y}
                  stroke="#BDA27C"
                  strokeWidth={4}
                />
              ))}
            </>
          )}
          {feet(101, 207, 117)}
        </G>
      );
      break;
    case "washer":
      art = (
        <G>
          {panel(79, 38, 162, 169)}
          <Line
            x1={83}
            x2={237}
            y1={78}
            y2={78}
            stroke="#29352A"
            strokeWidth={2}
          />
          {smallDisplay(91, 49, 50)}
          <Circle cx={205} cy={60} r={10} fill={metal} stroke="#B8BDA9" />
          {f === 2 ? (
            <>
              <Rect x={96} y={91} width={127} height={91} rx={10} fill={edge} />
              <Path d="M110 105h99v51h-99Z" fill={glass} />
            </>
          ) : (
            <>
              <Circle
                cx={160}
                cy={139}
                r={52}
                fill={metal}
                stroke="#B5BAA8"
                strokeWidth={2}
              />
              <Circle
                cx={160}
                cy={139}
                r={43}
                fill={glass}
                stroke="#111B12"
                strokeWidth={7}
              />
              <Path
                d="M125 156q37-25 70-2v10q-35 26-70-8Z"
                fill="#A7BAB3"
                opacity={0.2}
              />
              <Path
                d="M133 114q23-20 43-6"
                stroke="#CDD7C7"
                opacity={0.3}
                fill="none"
                strokeWidth={3}
              />
            </>
          )}
          {feet(87, 207, 146)}
        </G>
      );
      break;
    case "dishwasher":
      art = (
        <G>
          {panel(79, f === 1 ? 73 : 38, 162, f === 1 ? 134 : 169)}
          <Rect
            x={88}
            y={f === 1 ? 83 : 49}
            width={145}
            height={21}
            rx={4}
            fill={edge}
          />
          {smallDisplay(98, f === 1 ? 84 : 50, 43)}
          <Path
            d={f === 1 ? "M112 117h95" : "M112 83h95"}
            stroke="#C4C8B7"
            strokeWidth={5}
            strokeLinecap="round"
          />
          {detail && (
            <>
              <Line x1={91} x2={230} y1={187} y2={187} stroke="#788272" />
              <Path d="M143 172h34" stroke="#C4C6B3" opacity={0.4} />
            </>
          )}
          {feet(87, 207, 146)}
        </G>
      );
      break;
    case "kettle":
      art = (
        <G>
          <Path
            d="M211 88C276 81 267 163 216 167"
            fill="none"
            stroke={metal}
            strokeWidth={14}
          />
          <Path d="M109 93L77 78l20 47" fill={body} stroke="#A3A58C" />
          <Path
            d="M111 66q-10 33-15 91-2 36 64 36t64-36q-5-58-15-91Z"
            fill={f === 1 ? glass : body}
            stroke="#A1A88E"
          />
          <Ellipse cx={160} cy={66} rx={49} ry={12} fill={metal} />
          <Rect x={143} y={45} width={34} height={13} rx={6} fill={edge} />
          <Ellipse cx={160} cy={198} rx={69} ry={8} fill={edge} />
          {detail && (
            <Path
              d="M124 84v72"
              stroke="#ECEFDB"
              strokeWidth={3}
              opacity={0.25}
            />
          )}
          <Line
            x1={199}
            x2={199}
            y1={95}
            y2={153}
            stroke="#F6CF9A"
            strokeWidth={4}
          />
        </G>
      );
      break;
    case "microwave":
      art = (
        <G>
          {panel(39, 70, 242, 127)}
          <Rect x={51} y={82} width={167} height={101} rx={6} fill={edge} />
          <Rect x={60} y={90} width={148} height={82} rx={3} fill={glass} />
          <Path d="M198 102v58" stroke="#B7BEAA" strokeWidth={4} />
          {smallDisplay(233, 84, 35)}
          {button(250, 133)}
          {button(250, 161)}
          {detail && vents(72, 106, 10, 111)}
          {feet(48, 197, 224)}
        </G>
      );
      break;
    case "oven":
      art =
        f === 2 ? (
          <G>
            <Path
              d="M59 100l177-22 37 85-196 30Z"
              fill={body}
              stroke="#939D88"
            />
            {[
              [107, 120, 27],
              [190, 106, 22],
              [133, 160, 22],
              [221, 147, 26],
            ].map(([x, y, rx]) => (
              <G key={x}>
                <Ellipse
                  cx={x}
                  cy={y}
                  rx={rx}
                  ry={rx / 2}
                  fill="#182019"
                  stroke="#A3AD98"
                />
                <Ellipse
                  cx={x}
                  cy={y}
                  rx={rx - 6}
                  ry={(rx - 6) / 2}
                  fill="none"
                  stroke="#565E52"
                />
              </G>
            ))}
          </G>
        ) : (
          <G>
            {panel(73, 40, 174, 168)}
            <Rect
              x={83}
              y={79}
              width={154}
              height={111}
              rx={6}
              fill={glass}
              stroke="#212C22"
              strokeWidth={5}
            />
            <Path d="M96 90h127" stroke="#B6BDAA" strokeWidth={5} />
            {button(99, 60)}
            {button(220, 60)}
            {smallDisplay(137, 50, 45)}
            {detail && (
              <Path
                d="M94 147h132m-132 13h132m-132 13h132"
                stroke="#8D9987"
                opacity={0.5}
              />
            )}
          </G>
        );
      break;
    case "toaster":
      art =
        f === 0 ? (
          <G>
            <Path
              d="M73 109q0-32 37-32h105q31 0 31 32v83H73Z"
              fill={body}
              stroke="#9CA38B"
            />
            <Ellipse cx={159} cy={80} rx={76} ry={14} fill={metal} />
            <Path
              d="M108 76h93m-93 9h93"
              stroke="#182119"
              strokeWidth={6}
              strokeLinecap="round"
            />
            <Path d="M230 114v46" stroke="#151E16" strokeWidth={4} />
            <Rect x={222} y={135} width={22} height={7} rx={3} fill={metal} />
            {button(104, 164)}
            {feet(81, 192, 155)}
          </G>
        ) : (
          <G>
            <Path
              d="M68 135q92-48 184 0l-9 62H77Z"
              fill={body}
              stroke="#909984"
            />
            <Path d="M69 134q90-43 183 0" fill={edge} stroke="#B0B89F" />
            <Path d="M126 147h66v12h-66Z" fill={metal} />
            {button(217, 170)}
            {f === 3 && (
              <Path
                d="M98 111l124-6m-121-8l117-6m-107-8l94-5"
                stroke="#D19B69"
                strokeWidth={4}
              />
            )}
          </G>
        );
      break;
    case "coffee":
      art = (
        <G>
          {panel(90, 39, 140, 166)}
          <Rect x={101} y={79} width={117} height={97} rx={3} fill="#182018" />
          {smallDisplay(117, 49, 55)}
          <Path d="M125 88h69v17h-69Z" fill={metal} />
          <Path d="M149 105v13m20-13v13" stroke="#C6C8B2" strokeWidth={3} />
          {f === 1 ? (
            <Path d="M128 121h65l-5 56h-53Z" fill={glass} stroke="#A2AB91" />
          ) : (
            <>
              <Path d="M132 136h51l-5 37h-41Z" fill="#D4D9C8" />
              <Path
                d="M182 140q22-1 20 13-2 11-21 10"
                stroke="#D4D9C8"
                strokeWidth={6}
                fill="none"
              />
            </>
          )}
          <Path d="M102 183h116m-116 6h116" stroke="#9CA68E" strokeWidth={2} />
        </G>
      );
      break;
    case "blender":
      art = (
        <G>
          <Path d="M124 146h72l16 55H108Z" fill={body} stroke="#A9AE94" />
          {button(160, 175)}
          <Path
            d="M119 57h82l-10 91h-62Z"
            fill={glass}
            stroke="#B9C2A7"
            strokeWidth={2}
          />
          <Path
            d="M201 70q38 2 18 51l-20 7"
            fill="none"
            stroke={metal}
            strokeWidth={7}
          />
          <Rect x={114} y={47} width={92} height={12} rx={5} fill={edge} />
          {detail && (
            <Path
              d="M139 69v59m13-54v48m16-50v51"
              stroke="#BAC6B0"
              opacity={0.3}
            />
          )}
          <Path
            d="M139 132l20-9 22 9"
            stroke="#C1C7AF"
            strokeWidth={3}
            fill="none"
          />
        </G>
      );
      break;
    case "mixer":
      art =
        f === 1 ? (
          <G>
            <Path d="M71 92q5-30 48-30h101q30 0 30 32v46H71Z" fill={body} />
            <Path
              d="M104 80h91"
              stroke="#172119"
              strokeWidth={9}
              strokeLinecap="round"
            />
            <Path
              d="M119 140v47m61-47v47m-71-18h20m40 0h20"
              stroke={metal}
              strokeWidth={5}
            />
          </G>
        ) : (
          <G>
            <Path d="M123 190h111l-12-99h-30l-5 75h-64Z" fill={body} />
            <Path
              d="M80 80q0-34 46-34h77q34 0 34 40v18H80Z"
              fill={body}
              stroke="#9AA48C"
            />
            <Path
              d="M99 104v25m-13-2q13-18 26 0l-4 29H90Z"
              stroke={metal}
              strokeWidth={4}
              fill="none"
            />
            <Path
              d="M66 141h104q-3 52-52 52t-52-52"
              fill={metal}
              stroke="#C6CEB7"
            />
            <Ellipse cx={118} cy={141} rx={52} ry={10} fill="#111B13" />
          </G>
        );
      break;
    case "ricecooker":
      art = (
        <G>
          <Rect
            x={81}
            y={75}
            width={158}
            height={122}
            rx={f === 3 ? 23 : 37}
            fill={body}
            stroke="#A1AB91"
          />
          <Ellipse cx={160} cy={77} rx={77} ry={17} fill={metal} />
          <Path
            d="M129 60v-9q30-15 61 0v9"
            stroke={edge}
            strokeWidth={10}
            fill="none"
          />
          {smallDisplay(129, 118, 62)}
          {button(129, 161)}
          {button(190, 161)}
          {f === 3 && (
            <Rect x={124} y={181} width={72} height={12} rx={4} fill={edge} />
          )}
        </G>
      );
      break;
    case "hood":
      art = (
        <G>
          <Path d="M139 25h43v78h-43Z" fill={body} />
          <Path
            d="M57 139l83-38h42l81 38v23H57Z"
            fill={metal}
            stroke="#A8B19A"
          />
          <Path d="M64 161h192l-13 16H77Z" fill="#172119" />
          {[106, 137, 168, 199].map((x) => (
            <Line
              key={x}
              x1={x}
              x2={x}
              y1={163}
              y2={173}
              stroke="#77836B"
              strokeWidth={3}
            />
          ))}
          <Rect x={197} y={145} width={31} height={4} rx={2} fill="#E3C188" />
        </G>
      );
      break;
    case "computer":
      art = (
        <G>
          {panel(
            f === 2 ? 87 : 100,
            f === 2 ? 108 : 31,
            f === 2 ? 146 : 120,
            f === 2 ? 87 : 172,
          )}
          <Rect
            x={112}
            y={f === 2 ? 118 : 44}
            width={96}
            height={f === 2 ? 57 : 133}
            rx={6}
            fill={f === 1 ? glass : edge}
          />
          {f === 1
            ? [80, 126].map((y) => (
                <G key={y}>
                  <Circle
                    cx={160}
                    cy={y}
                    r={22}
                    fill="#18211B"
                    stroke="#BA956B"
                    strokeWidth={3}
                  />
                  <Circle cx={160} cy={y} r={8} fill={metal} />
                </G>
              ))
            : vents(124, f === 2 ? 131 : 57, f === 2 ? 5 : 14, 72)}
          {button(160, f === 2 ? 186 : 190)}
          {feet(107, 203, 105)}
        </G>
      );
      break;
    case "laptop":
      art =
        f === 1 ? (
          <G>
            <Rect x={93} y={30} width={134} height={179} rx={15} fill={metal} />
            <Rect x={100} y={40} width={120} height={157} rx={7} fill={glass} />
            <Circle cx={160} cy={203} r={2.5} fill="#7D8972" />
          </G>
        ) : (
          <G>
            <Rect
              x={67}
              y={42}
              width={186}
              height={126}
              rx={8}
              fill={edge}
              stroke="#A4AE97"
            />
            <Rect x={75} y={50} width={170} height={107} rx={3} fill={glass} />
            <Path d="M67 168h186l34 33H33Z" fill={metal} stroke="#9BA78F" />
            <Path d="M83 176h154l15 13H68Z" fill="#253026" />
            {detail &&
              Array.from({ length: 4 }, (_, i) => (
                <Line
                  key={i}
                  x1={82 - i * 3}
                  x2={238 + i * 3}
                  y1={177 + i * 3}
                  y2={177 + i * 3}
                  stroke="#7C8873"
                  strokeWidth={0.7}
                />
              ))}
            <Path d="M129 190h62l7 8h-76Z" fill="#707C69" />
            <Path d="M33 201h254l-7 8H40Z" fill={edge} />
          </G>
        );
      break;
    case "router":
      art =
        f === 1 ? (
          <G>
            <Rect
              x={113}
              y={49}
              width={94}
              height={154}
              rx={38}
              fill={body}
              stroke="#8D9A82"
            />
            <Ellipse cx={160} cy={51} rx={44} ry={12} fill={metal} />
            {button(160, 176)}
          </G>
        ) : (
          <G>
            {f !== 2 &&
              [82, 130, 190, 238].map((x, i) => (
                <Path
                  key={x}
                  d={`M${x} 122l${i < 2 ? -13 : 13}-70`}
                  stroke={metal}
                  strokeWidth={7}
                  strokeLinecap="round"
                />
              ))}
            <Path
              d="M57 131l192-9 24 60-207 11Z"
              fill={body}
              stroke="#89967C"
            />
            <Path d="M66 193l207-11v11L66 204Z" fill={edge} />
            {[0, 1, 2, 3, 4].map((i) => (
              <Circle
                key={i}
                cx={102 + i * 21}
                cy={183 - i}
                r={2.3}
                fill={i < 3 ? "#A7BA8E" : "#57634E"}
              />
            ))}
            {detail && vents(100, 145, 5, 124)}
          </G>
        );
      break;
    case "charger":
      art =
        f === 1 ? (
          <G>
            <Ellipse cx={160} cy={159} rx={88} ry={36} fill={metal} />
            <Ellipse cx={160} cy={154} rx={80} ry={28} fill={body} />
            <Ellipse
              cx={160}
              cy={153}
              rx={59}
              ry={19}
              fill="none"
              stroke="#9CAB8D"
              opacity={0.4}
            />
            <Path
              d="M238 161q49 7 30 41"
              stroke="#374530"
              strokeWidth={5}
              fill="none"
            />
          </G>
        ) : (
          <G>
            {panel(
              f === 3 ? 77 : 109,
              f === 3 ? 67 : 68,
              f === 3 ? 166 : 102,
              f === 3 ? 130 : 109,
            )}
            {f === 0 && (
              <>
                <Path d="M133 66V39m54 27V39" stroke={metal} strokeWidth={8} />
                <Rect
                  x={143}
                  y={149}
                  width={36}
                  height={13}
                  rx={3}
                  fill="#172117"
                  stroke="#94A084"
                />
              </>
            )}
            {f === 2 && (
              <>
                <Rect x={124} y={84} width={70} height={9} rx={4} fill={edge} />
                {[137, 153, 169, 185].map((x) => (
                  <Circle key={x} cx={x} cy={125} r={2.7} fill="#DCBC84" />
                ))}
              </>
            )}
            {f === 3 && (
              <>
                {smallDisplay(93, 82, 65)}
                {button(210, 103)}
                {vents(92, 121, 8, 72)}
              </>
            )}
          </G>
        );
      break;
    case "socket":
      art =
        f === 1 ? (
          <G>
            <Rect
              x={38}
              y={99}
              width={244}
              height={78}
              rx={17}
              fill={body}
              stroke="#A7B299"
            />
            {[82, 139, 196].map((x) => (
              <G key={x}>
                <Circle cx={x} cy={138} r={21} fill={edge} />
                <Circle cx={x - 7} cy={138} r={3} fill="#121C13" />
                <Circle cx={x + 7} cy={138} r={3} fill="#121C13" />
              </G>
            ))}
            <Rect
              x={236}
              y={121}
              width={24}
              height={33}
              rx={5}
              fill="#A66F44"
            />
          </G>
        ) : (
          <G>
            <Rect
              x={99}
              y={49}
              width={122}
              height={145}
              rx={27}
              fill={body}
              stroke="#C5CDB5"
            />
            <Circle
              cx={160}
              cy={116}
              r={43}
              fill={edge}
              stroke="#919E83"
              strokeWidth={3}
            />
            <Circle cx={146} cy={116} r={6} fill="#111A12" />
            <Circle cx={174} cy={116} r={6} fill="#111A12" />
            {button(160, 175)}
          </G>
        );
      break;
    case "humidifier":
      art = (
        <G>
          <Path
            d={
              f === 1
                ? "M106 184q-8-50 54-111 62 61 54 111-54 31-108 0Z"
                : "M102 107q0-25 58-25t58 25v86q-58 23-116 0Z"
            }
            fill={body}
            stroke="#A8B397"
          />
          <Ellipse
            cx={160}
            cy={f === 1 ? 173 : 107}
            rx={f === 1 ? 39 : 57}
            ry={10}
            fill={metal}
          />
          {button(160, 179)}
          <Path
            d="M154 67q-15-16 0-31m14 31q17-22 0-38"
            fill="none"
            stroke="#D7DCC8"
            strokeWidth={4}
            opacity={0.45}
          />
        </G>
      );
      break;
    case "purifier":
      art = (
        <G>
          {panel(
            f === 2 ? 123 : 101,
            f === 2 ? 28 : 45,
            f === 2 ? 74 : 118,
            f === 2 ? 179 : 162,
          )}
          {smallDisplay(f === 2 ? 136 : 136, 61, f === 2 ? 48 : 47)}
          {vents(
            f === 2 ? 135 : 114,
            100,
            f === 2 ? 18 : 16,
            f === 2 ? 50 : 92,
          )}
          {button(160, 188)}
          {f === 3 && <Path d="M220 114h20v55h-20" fill={edge} />}
        </G>
      );
      break;
    case "vacuum":
      art =
        f === 1 ? (
          <G>
            <Path d="M170 53L126 191" stroke={metal} strokeWidth={11} />
            <Path d="M145 101l-3-65h61l-10 70Z" fill={body} stroke="#A7B496" />
            <Path d="M104 188h70l18 23H82Z" fill={edge} />
            <Circle
              cx={167}
              cy={78}
              r={24}
              fill={glass}
              stroke="#9B8764"
              strokeWidth={5}
            />
          </G>
        ) : (
          <G>
            <Path
              d="M114 117q-2-64 78-65t68 92"
              fill="none"
              stroke="#293729"
              strokeWidth={13}
            />
            <Path
              d="M80 142q0-39 58-39t72 39l-8 50H83Z"
              fill={body}
              stroke="#97A68A"
            />
            <Circle
              cx={111}
              cy={184}
              r={24}
              fill={edge}
              stroke="#718166"
              strokeWidth={5}
            />
            <Circle cx={193} cy={184} r={20} fill={edge} />
            <Path d="M260 144l-12 56" stroke={metal} strokeWidth={8} />
            <Path d="M229 198h42v11h-46Z" fill={edge} />
          </G>
        );
      break;
    case "robotvac":
      art = (
        <G>
          <Ellipse cx={160} cy={159} rx={103} ry={48} fill={edge} />
          <Ellipse
            cx={160}
            cy={146}
            rx={103}
            ry={48}
            fill={body}
            stroke="#A2B192"
            strokeWidth={2}
          />
          <Ellipse
            cx={160}
            cy={145}
            rx={84}
            ry={36}
            fill="none"
            stroke="#AEB89B"
            strokeWidth={1}
            opacity={0.5}
          />
          <Ellipse cx={160} cy={126} rx={25} ry={12} fill={edge} />
          <Ellipse cx={160} cy={121} rx={25} ry={11} fill={metal} />
          {button(202, 148)}
          <Path
            d="M78 174q82 33 163-2"
            stroke="#0B130C"
            strokeWidth={5}
            fill="none"
          />
        </G>
      );
      break;
    case "iron":
      art = (
        <G>
          <Path d="M58 181q51-67 177-54l31 58Z" fill={body} stroke="#9EAB8D" />
          <Path d="M59 183h209l-8 15H56Z" fill={metal} />
          <Path
            d="M130 128q0-73 75-47l24 46"
            fill="none"
            stroke={edge}
            strokeWidth={16}
          />
          <Path
            d="M122 138l42-18 31 12"
            stroke="#D4D8BE"
            strokeWidth={4}
            fill="none"
          />
          {button(210, 152)}
          {f === 1 && <Path d="M78 199h189v17H78Z" fill={edge} />}
        </G>
      );
      break;
    case "hairdryer":
      art =
        f === 0 ? (
          <G>
            <Path
              d="M79 74q81-37 170 2v55q-93 29-170-4Z"
              fill={body}
              stroke="#A9B798"
            />
            <Ellipse cx={79} cy={101} rx={20} ry={28} fill={edge} />
            <Ellipse cx={79} cy={101} rx={13} ry={21} fill="#111B12" />
            <Path d="M167 137l39 60-25 13-41-69Z" fill={body} />
            {vents(209, 83, 8, 25)}
          </G>
        ) : (
          <G>
            <Rect
              x={140}
              y={48}
              width={40}
              height={157}
              rx={18}
              fill={body}
              stroke="#ADB99A"
            />
            <Path d="M148 74h24v48h-24Z" fill={edge} />
            {button(160, 148)}
            {f === 3 && <Path d="M149 48V27h22v21" fill="#D7DCC9" />}
          </G>
        );
      break;
    case "printer":
      art = (
        <G>
          <Rect x={102} y={34} width={116} height={62} rx={3} fill="#D8DFCB" />
          <Path
            d="M117 46h85m-85 8h85m-85 8h61"
            stroke="#8D9F83"
            strokeWidth={1.5}
          />
          {panel(62, 82, 196, 100)}
          <Rect x={77} y={113} width={167} height={24} rx={4} fill={edge} />
          {button(229, 98)}
          <Path d="M100 139h120v66H100Z" fill="#CFD7C1" />
          <Path
            d="M114 153h91m-91 8h91m-91 8h74m-74 8h91"
            stroke="#8E9F84"
            strokeWidth={1.6}
          />
        </G>
      );
      break;
    case "speaker":
      art =
        f === 1 ? (
          <G>
            <Rect
              x={34}
              y={119}
              width={252}
              height={53}
              rx={20}
              fill={body}
              stroke="#A1AF91"
            />
            {vents(48, 128, 7, 224)}
          </G>
        ) : (
          <G>
            {panel(f === 2 ? 110 : 101, 37, f === 2 ? 100 : 118, 170)}
            <Circle
              cx={160}
              cy={f === 2 ? 113 : 144}
              r={f === 2 ? 33 : 42}
              fill={edge}
              stroke="#849577"
              strokeWidth={2}
            />
            <Circle
              cx={160}
              cy={f === 2 ? 113 : 144}
              r={f === 2 ? 24 : 31}
              fill={body}
            />
            <Circle cx={160} cy={f === 2 ? 113 : 144} r={12} fill={metal} />
            {f !== 2 && (
              <Circle cx={160} cy={74} r={18} fill={edge} stroke="#849577" />
            )}
            {f === 2 && (
              <Ellipse
                cx={160}
                cy={43}
                rx={37}
                ry={7}
                fill={warm}
                opacity={0.7}
              />
            )}
          </G>
        );
      break;
    case "projector":
      art = (
        <G>
          <Path d="M65 97l157-17 37 66-181 15Z" fill={metal} stroke="#9BAA8A" />
          <Path d="M78 161l181-15v44L78 207Z" fill={body} />
          <Ellipse
            cx={126}
            cy={177}
            rx={29}
            ry={27}
            fill="#111A12"
            stroke="#849773"
            strokeWidth={5}
          />
          <Ellipse cx={126} cy={177} rx={19} ry={18} fill={glass} />
          <Circle cx={120} cy={170} r={7} fill="#E1E7C6" opacity={0.25} />
          {vents(185, 162, 6, 57)}
        </G>
      );
      break;
    case "console":
      art =
        f === 1 ? (
          <G>
            <Path d="M69 111l154-14 39 57-177 17Z" fill={body} />
            <Path d="M85 171l177-17v18L85 191Z" fill={edge} />
            {button(232, 165)}
          </G>
        ) : (
          <G>
            <Path
              d="M119 28q-26 75-12 178h49V28Z"
              fill={body}
              stroke="#ADB99B"
            />
            <Path
              d="M164 28v178h47q15-101-15-178Z"
              fill={body}
              stroke="#ADB99B"
            />
            <Path d="M153 36h14v161h-14Z" fill="#111A12" />
            <Path d="M183 73v88" stroke="#111A12" strokeWidth={4} />
            {button(187, 188)}
          </G>
        );
      break;
    case "camera":
      art = (
        <G>
          <Path d="M153 168h14l16 28h-46Z" fill={metal} />
          <Ellipse cx={160} cy={202} rx={49} ry={8} fill={body} />
          {panel(104, 52, 112, 113)}
          <Circle
            cx={160}
            cy={107}
            r={40}
            fill={edge}
            stroke="#8D9F7F"
            strokeWidth={3}
          />
          <Circle cx={160} cy={107} r={26} fill={glass} />
          <Circle cx={160} cy={107} r={12} fill="#15241C" />
          <Circle cx={151} cy={98} r={7} fill="#C6D2B4" opacity={0.36} />
          <Circle cx={191} cy={145} r={2.5} fill="#EFAC72" />
        </G>
      );
      break;
    case "pump":
      art = (
        <G>
          <Path d="M96 183h147v18H96Z" fill={edge} />
          <Circle
            cx={129}
            cy={139}
            r={45}
            fill={body}
            stroke="#9EAD8C"
            strokeWidth={2}
          />
          <Circle cx={129} cy={139} r={22} fill={metal} />
          <Path d="M162 105h77v70h-77Z" fill={body} />
          {vents(172, 113, 10, 59)}
          <Path
            d="M99 104V73h28v25m103 75h34v-24"
            stroke={metal}
            strokeWidth={15}
            fill="none"
          />
        </G>
      );
      break;
    case "aquarium":
      art =
        f === 1 ? (
          <G>
            <Path
              d="M111 49h98v154h-98Z"
              fill={glass}
              stroke="#748E73"
              strokeWidth={5}
            />
            <Path d="M130 68h57v105h-57Z" fill="#556D50" />
            {vents(139, 81, 16, 39)}
            <Path
              d="M158 49V25h56"
              stroke={metal}
              strokeWidth={9}
              fill="none"
            />
          </G>
        ) : (
          <G>
            <Rect
              x={47}
              y={59}
              width={226}
              height={139}
              rx={5}
              fill={glass}
              stroke="#8EAA90"
              strokeWidth={4}
            />
            <Path d="M52 87h216v106H52Z" fill="#6D9985" opacity={0.27} />
            <Rect x={44} y={48} width={232} height={13} rx={4} fill={edge} />
            <Path d="M53 181q60-11 105 0t110-1v13H53Z" fill="#B1A67F" />
            <Path
              d="M81 179q-15-47 8-66m-1 66q27-29 9-53m130 53q-22-48-3-74"
              fill="none"
              stroke="#87A679"
              strokeWidth={5}
            />
            <Path
              d="M143 126q25-18 49 0-24 17-49 0l-15 12v-24Z"
              fill="#E1B47C"
            />
          </G>
        );
      break;
    case "bed":
      art = (
        <G>
          <Path d="M64 84h194l-6 114H57Z" fill={body} stroke="#A1B08E" />
          <Path
            d="M69 108h183m-185 24h183m-185 24h183m-185 24h183"
            stroke="#CEB898"
            strokeWidth={3}
          />
          <Path
            d="M250 120q32 10 19 58l-24 21"
            stroke="#A0AA8C"
            strokeWidth={4}
            fill="none"
          />
          <Rect x={237} y={178} width={38} height={31} rx={8} fill={edge} />
          {button(256, 190)}
        </G>
      );
      break;
    case "tool":
      art =
        f === 1 ? (
          <G>
            {panel(63, 111, 125, 85)}
            {smallDisplay(78, 125, 56)}
            {button(159, 154)}
            <Path d="M187 141l52-88 10 6-42 93" fill={metal} />
            <Path d="M249 58l14-18" stroke="#BDC8AC" strokeWidth={3} />
          </G>
        ) : (
          <G>
            <Path d="M93 72h118l21 53H93Z" fill={body} stroke="#9AAD87" />
            <Path d="M135 125h46l-16 68h-45Z" fill={body} />
            <Path d="M112 194h66v15h-66Z" fill={edge} />
            <Path d="M212 82h36v30h-23Z" fill={metal} />
            <Path d="M247 94h32" stroke="#AEBB9A" strokeWidth={6} />
            {vents(106, 85, 6, 62)}
          </G>
        );
      break;
    default:
      art = (
        <G>
          {panel(90, 49, 140, 154)}
          <Path d="M103 67h114v86H103Z" fill={edge} />
          <Path
            d="M128 103h64m-32-22v45"
            stroke="#9AA88A"
            strokeWidth={3}
            strokeLinecap="round"
          />
          {button(160, 177)}
          <Path d="M101 204h118" stroke="#93A27F" strokeWidth={5} />
        </G>
      );
  }
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 320 240"
      style={[{ position: "relative" }, style]}
      accessible={Platform.OS === "web" ? undefined : !!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
    >
      <Defs>
        <LinearGradient id={`${prefix}body`} x1="0%" y1="0%" x2="100%" y2="85%">
          <Stop offset="0" stopColor="#FFF5D8" stopOpacity={0.84} />
          <Stop offset="0.23" stopColor={illustrationColors[safe.color]} />
          <Stop offset="0.72" stopColor={illustrationColors[safe.color]} />
          <Stop offset="1" stopColor="#222C23" />
        </LinearGradient>
        <LinearGradient
          id={`${prefix}edge`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <Stop stopColor="#616D58" />
          <Stop offset="0.25" stopColor="#354131" />
          <Stop offset="0.67" stopColor="#151E16" />
          <Stop offset="1" stopColor="#0C140E" />
        </LinearGradient>
        <LinearGradient id={`${prefix}metal`} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop stopColor="#554C36" />
          <Stop offset="0.2" stopColor="#D9C49C" />
          <Stop offset="0.4" stopColor="#B4AB8F" />
          <Stop offset="0.65" stopColor="#73775F" />
          <Stop offset="1" stopColor="#343E2E" />
        </LinearGradient>
        <LinearGradient
          id={`${prefix}glass`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <Stop stopColor="#5F7C69" />
          <Stop offset="0.22" stopColor="#263B30" />
          <Stop offset="0.63" stopColor="#12251C" />
          <Stop offset="1" stopColor="#1C2F23" />
        </LinearGradient>
        <LinearGradient id={`${prefix}warm`} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop stopColor="#FFF7D7" />
          <Stop offset="0.55" stopColor="#FFDB94" />
          <Stop offset="1" stopColor="#FFA15C" />
        </LinearGradient>
        <RadialGradient id={`${prefix}glow`}>
          <Stop stopColor="#FFE9A9" stopOpacity={0.46} />
          <Stop offset="1" stopColor="#FFBA6A" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse
        cx={160}
        cy={216}
        rx={102}
        ry={10}
        fill="#050A06"
        opacity={0.25}
      />
      {art}
      {detail && (
        <SvgText
          x={160}
          y={229}
          textAnchor="middle"
          fontSize={5.5}
          letterSpacing={1.7}
          fill="#A3AD96"
          opacity={0.32}
        >
          SPECWATT
        </SvgText>
      )}
    </Svg>
  );
}
