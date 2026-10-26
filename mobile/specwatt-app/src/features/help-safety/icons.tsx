import React from "react";
import Svg, { Path, Circle } from "react-native-svg";
import { theme } from "../../specwatt/theme";

/**
 * Module-local stroke icons. They reuse the shared catalog's visual style
 * (24 viewBox, 1.55 stroke, round caps) and extend it additively; the
 * shared mobile-ui Icon set is untouched.
 */
export type ModuleIconName =
  | "search"
  | "chevron"
  | "close"
  | "lock"
  | "check"
  | "wifi-off"
  | "database"
  | "cloud"
  | "download"
  | "trash"
  | "book"
  | "bolt"
  | "settings"
  | "shield";
const paths: Record<ModuleIconName, string> = {
  bolt: "M14 2L3 14h8l-1 8 11-12h-8Z",
  settings: "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z",
  shield: "M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6ZM8 11l3 3 5-6",
  search: "M10.5 3a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15ZM16 16l5.5 5.5",
  chevron: "M6 9l6 6 6-6",
  close: "M5 5l14 14M19 5L5 19",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5Z",
  check: "M4 12.5l5 5L20 6.5",
  "wifi-off": "M2 2l20 20M8.5 8.6a10 10 0 0 1 7-.3M5 5c-1.2.8-2.2 1.7-3 2.7M22 7.7a13 13 0 0 0-4-3.4M8 12.4a6 6 0 0 1 3-1.3M2.6 12.7A10 10 0 0 1 5 10.6M12 20.5h.01M9.5 16.6a4 4 0 0 1 5 .3",
  database: "M12 3c5 0 9 1.3 9 3s-4 3-9 3-9-1.3-9-3 4-3 9-3ZM3 6v12c0 1.7 4 3 9 3s9-1.3 9-3V6M21 12c0 1.7-4 3-9 3s-9-1.3-9-3",
  cloud: "M7 18a5 5 0 0 1-.5-9.97A6 6 0 0 1 18 9.3 4 4 0 0 1 17.5 18Z",
  download: "M12 3v12M6 10l6 5 6-5M4 21h16",
  trash: "M4 6h16M9 6V4h6v2M6.5 6l1 15h9l1-15M10 10v7M14 10v7",
  book: "M4 4h7a2 2 0 0 1 2 2v15a2 2 0 0 0-2-2H4ZM20 4h-7a2 2 0 0 0-2 2v15a2 2 0 0 1 2-2h7Z",
};
export function ModuleIcon({
  name,
  size = 24,
  color = theme.muted,
}: {
  name: ModuleIconName;
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.55}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={paths[name]} />
      {name === "search" && <Circle cx={10.5} cy={10.5} r={7.5} />}
      {name === "settings" && <Circle cx={12} cy={12} r={3.5} />}
    </Svg>
  );
}
