/** Bounded offline template choices. User data is never interpreted as SVG/XML. */
export const visualFamilies = [
  "lamp",
  "bulb",
  "led",
  "pendant",
  "spotlight",
  "fan",
  "ceilingfan",
  "ac",
  "heater",
  "radiator",
  "boiler",
  "tv",
  "fridge",
  "washer",
  "dishwasher",
  "kettle",
  "microwave",
  "oven",
  "toaster",
  "coffee",
  "blender",
  "mixer",
  "ricecooker",
  "hood",
  "computer",
  "monitor",
  "laptop",
  "router",
  "charger",
  "socket",
  "humidifier",
  "purifier",
  "vacuum",
  "robotvac",
  "iron",
  "hairdryer",
  "printer",
  "speaker",
  "projector",
  "console",
  "camera",
  "pump",
  "aquarium",
  "bed",
  "tool",
  "unknown",
] as const;
export type VisualFamily = (typeof visualFamilies)[number];
export type DeviceGroup =
  | "lighting"
  | "climate"
  | "kitchen"
  | "utility"
  | "computing"
  | "media"
  | "care"
  | "workshop";
export type DeviceCategory = {
  id: string;
  ru: string;
  ky: string;
  family: VisualFamily;
  group: DeviceGroup;
  form: number;
};
type Entry = readonly [string, string, string, VisualFamily, number?];
const grouped: Record<DeviceGroup, readonly Entry[]> = {
  lighting: [
    ["desk-lamp", "Настольный светильник", "Үстөл чырагы", "lamp", 0],
    [
      "mushroom-lamp",
      "Грибовидный светильник",
      "Козу карын сымал чырак",
      "lamp",
      1,
    ],
    ["floor-lamp", "Торшер", "Пол чырагы", "lamp", 2],
    [
      "bedside-lamp",
      "Прикроватная лампа",
      "Керебет жанындагы чырак",
      "lamp",
      3,
    ],
    ["reading-lamp", "Лампа для чтения", "Окуу чырагы", "lamp", 4],
    ["led-strip", "LED-лента", "LED тасма", "led", 0],
    ["led-reel", "Катушка LED-ленты", "LED тасма түрмөгү", "led", 1],
    ["light-bar", "Световая панель", "Жарык тилкеси", "led", 2],
    ["smart-bulb", "Умная лампочка", "Акылдуу лампочка", "bulb", 0],
    ["filament-bulb", "Филаментная лампа", "Жиптүү лампа", "bulb", 1],
    ["candle-bulb", "Лампа-свеча", "Шам сымал лампа", "bulb", 2],
    ["pendant-light", "Подвесной светильник", "Асма чырак", "pendant", 0],
    ["chandelier", "Люстра", "Люстра", "pendant", 1],
    ["wall-sconce", "Бра", "Дубал чырагы", "pendant", 2],
    ["ceiling-spot", "Потолочный спот", "Шып чырагы", "spotlight", 0],
    ["track-light", "Трековый светильник", "Релстүү чырак", "spotlight", 1],
    ["floodlight", "Прожектор", "Прожектор", "spotlight", 2],
    ["nightlight", "Ночник", "Түнкү чырак", "lamp", 5],
  ],
  climate: [
    ["pc-fan", "Вентилятор стенда", "Стенд желдеткичи", "fan", 0],
    ["desk-fan", "Настольный вентилятор", "Үстөл желдеткичи", "fan", 1],
    ["floor-fan", "Напольный вентилятор", "Пол желдеткичи", "fan", 2],
    ["tower-fan", "Колонный вентилятор", "Мунара желдеткичи", "purifier", 2],
    ["ceiling-fan", "Потолочный вентилятор", "Шып желдеткичи", "ceilingfan", 0],
    ["extractor-fan", "Вытяжной вентилятор", "Сордуруучу желдеткич", "fan", 3],
    ["air-conditioner", "Кондиционер", "Кондиционер", "ac", 0],
    [
      "portable-ac",
      "Мобильный кондиционер",
      "Көчмө кондиционер",
      "purifier",
      3,
    ],
    ["heat-pump", "Тепловой насос", "Жылуулук насосу", "ac", 1],
    ["convector", "Конвектор", "Конвектор", "heater", 0],
    [
      "ceramic-heater",
      "Керамический обогреватель",
      "Керамикалык жылыткыч",
      "heater",
      1,
    ],
    [
      "infrared-heater",
      "Инфракрасный обогреватель",
      "Инфракызыл жылыткыч",
      "heater",
      2,
    ],
    ["oil-radiator", "Масляный радиатор", "Май радиатору", "radiator", 0],
    ["electric-fireplace", "Электрокамин", "Электр камин", "heater", 3],
    [
      "water-boiler",
      "Накопительный бойлер",
      "Суу топтоочу бойлер",
      "boiler",
      0,
    ],
    [
      "instant-water-heater",
      "Проточный водонагреватель",
      "Агын суу жылыткыч",
      "boiler",
      1,
    ],
    ["humidifier", "Увлажнитель", "Аба нымдагыч", "humidifier", 0],
    ["aroma-diffuser", "Аромадиффузор", "Жыт тараткыч", "humidifier", 1],
    ["air-purifier", "Очиститель воздуха", "Аба тазалагыч", "purifier", 0],
    ["dehumidifier", "Осушитель", "Аба кургаткыч", "purifier", 1],
  ],
  kitchen: [
    ["fridge", "Холодильник", "Муздаткыч", "fridge", 0],
    [
      "double-fridge",
      "Двухдверный холодильник",
      "Эки эшиктүү муздаткыч",
      "fridge",
      1,
    ],
    ["mini-fridge", "Мини-холодильник", "Кичи муздаткыч", "fridge", 2],
    ["freezer", "Морозильник", "Тоңдургуч", "fridge", 3],
    ["wine-cooler", "Винный шкаф", "Суусундук муздаткычы", "fridge", 4],
    ["dishwasher", "Посудомоечная машина", "Идиш жуугуч", "dishwasher", 0],
    [
      "countertop-dishwasher",
      "Компактная посудомойка",
      "Чакан идиш жуугуч",
      "dishwasher",
      1,
    ],
    ["kettle", "Электрочайник", "Электр чайнек", "kettle", 0],
    ["glass-kettle", "Стеклянный чайник", "Айнек чайнек", "kettle", 1],
    ["thermopot", "Термопот", "Термопот", "ricecooker", 2],
    ["microwave", "Микроволновая печь", "Микротолкундуу меш", "microwave", 0],
    ["oven", "Духовой шкаф", "Духовка", "oven", 0],
    ["mini-oven", "Мини-печь", "Кичи меш", "oven", 1],
    ["induction-hob", "Индукционная плита", "Индукциялык плита", "oven", 2],
    ["toaster", "Тостер", "Тостер", "toaster", 0],
    ["sandwich-maker", "Сэндвичница", "Сэндвич жасагыч", "toaster", 1],
    ["waffle-maker", "Вафельница", "Вафли жасагыч", "toaster", 2],
    ["espresso-machine", "Кофемашина", "Кофе машинасы", "coffee", 0],
    [
      "drip-coffee",
      "Капельная кофеварка",
      "Тамчылатма кофе кайнаткыч",
      "coffee",
      1,
    ],
    ["coffee-grinder", "Кофемолка", "Кофе майдалагыч", "blender", 2],
    ["blender", "Блендер", "Блендер", "blender", 0],
    ["food-processor", "Кухонный комбайн", "Ашкана комбайны", "blender", 1],
    ["stand-mixer", "Планетарный миксер", "Туруктуу миксер", "mixer", 0],
    ["hand-mixer", "Ручной миксер", "Кол миксери", "mixer", 1],
    ["multicooker", "Мультиварка", "Мультиварка", "ricecooker", 0],
    ["rice-cooker", "Рисоварка", "Күрүч бышыргыч", "ricecooker", 1],
    ["air-fryer", "Аэрогриль", "Аэрогриль", "ricecooker", 3],
    ["cooker-hood", "Кухонная вытяжка", "Ашкана соргучу", "hood", 0],
    ["juicer", "Соковыжималка", "Шире сыгуучу", "blender", 3],
    ["electric-grill", "Электрогриль", "Электр гриль", "toaster", 3],
  ],
  utility: [
    ["washing-machine", "Стиральная машина", "Кир жуугуч машина", "washer", 0],
    ["dryer", "Сушильная машина", "Кир кургаткыч", "washer", 1],
    [
      "top-washer",
      "Вертикальная стиральная машина",
      "Үстүнөн жүктөлүүчү кир жуугуч",
      "washer",
      2,
    ],
    ["vacuum-cleaner", "Пылесос", "Чаң соргуч", "vacuum", 0],
    ["stick-vacuum", "Вертикальный пылесос", "Тик чаң соргуч", "vacuum", 1],
    ["robot-vacuum", "Робот-пылесос", "Робот чаң соргуч", "robotvac", 0],
    ["robot-mop", "Робот-полотёр", "Робот пол жуугуч", "robotvac", 1],
    ["steam-cleaner", "Пароочиститель", "Буу тазалагыч", "vacuum", 2],
    ["iron", "Утюг", "Үтүк", "iron", 0],
    ["steam-station", "Паровая станция", "Буу станциясы", "iron", 1],
    ["water-pump", "Водяной насос", "Суу насосу", "pump", 0],
    ["circulation-pump", "Циркуляционный насос", "Айлантуу насосу", "pump", 1],
    ["aquarium", "Аквариум", "Аквариум", "aquarium", 0],
    [
      "aquarium-filter",
      "Аквариумный фильтр",
      "Аквариум чыпкасы",
      "aquarium",
      1,
    ],
    ["electric-blanket", "Электроодеяло", "Электр жууркан", "bed", 0],
  ],
  computing: [
    ["desktop-pc", "Компьютер", "Компьютер", "computer", 0],
    ["gaming-pc", "Игровой компьютер", "Оюн компьютери", "computer", 1],
    ["mini-pc", "Мини-ПК", "Кичи компьютер", "computer", 2],
    ["monitor", "Монитор", "Монитор", "monitor", 0],
    ["ultrawide-monitor", "Широкий монитор", "Кең монитор", "monitor", 1],
    ["laptop", "Ноутбук", "Ноутбук", "laptop", 0],
    ["tablet", "Планшет", "Планшет", "laptop", 1],
    ["wifi-router", "Wi-Fi роутер", "Wi-Fi роутер", "router", 0],
    ["mesh-router", "Mesh-станция", "Mesh станциясы", "router", 1],
    ["network-switch", "Сетевой коммутатор", "Тармак коммутатору", "router", 2],
    ["nas-storage", "Сетевое хранилище", "Тармак сактагычы", "computer", 3],
    ["printer", "Принтер", "Принтер", "printer", 0],
    ["laser-printer", "Лазерный принтер", "Лазер принтер", "printer", 1],
    ["phone-charger", "Зарядное устройство", "Кубаттагыч", "charger", 0],
    [
      "wireless-charger",
      "Беспроводная зарядка",
      "Зымсыз кубаттагыч",
      "charger",
      1,
    ],
    ["power-bank", "Пауэрбанк", "Көчмө кубаттагыч", "charger", 2],
    ["smart-socket", "Умная розетка", "Акылдуу розетка", "socket", 0],
    ["power-strip", "Сетевой фильтр", "Узарткыч", "socket", 1],
  ],
  media: [
    ["television", "Телевизор", "Телевизор", "tv", 0],
    ["soundbar", "Саундбар", "Саундбар", "speaker", 1],
    ["bookshelf-speaker", "Акустическая колонка", "Үн колонкасы", "speaker", 0],
    ["smart-speaker", "Умная колонка", "Акылдуу колонка", "speaker", 2],
    ["subwoofer", "Сабвуфер", "Сабвуфер", "speaker", 3],
    ["projector", "Проектор", "Проектор", "projector", 0],
    ["game-console", "Игровая консоль", "Оюн консолу", "console", 0],
    ["tv-box", "ТВ-приставка", "ТВ кутучасы", "console", 1],
    ["security-camera", "Камера наблюдения", "Байкоо камерасы", "camera", 0],
    ["baby-monitor", "Видеоняня", "Бала көзөмөлдөгүч", "camera", 1],
  ],
  care: [
    ["hair-dryer", "Фен", "Чач кургаткыч", "hairdryer", 0],
    ["hair-styler", "Стайлер", "Чач жасалгалагыч", "hairdryer", 1],
    ["electric-shaver", "Электробритва", "Электр устара", "hairdryer", 2],
    [
      "electric-toothbrush",
      "Электрическая зубная щётка",
      "Электр тиш щеткасы",
      "hairdryer",
      3,
    ],
  ],
  workshop: [
    ["drill", "Дрель", "Бургу", "tool", 0],
    ["soldering-station", "Паяльная станция", "Ширетүү станциясы", "tool", 1],
    [
      "bench-power-supply",
      "Лабораторный блок питания",
      "Лабораториялык кубат булагы",
      "charger",
      3,
    ],
    ["unknown", "Неизвестное устройство", "Белгисиз түзмөк", "unknown", 0],
  ],
};
export const deviceCatalog: readonly DeviceCategory[] = Object.entries(
  grouped,
).flatMap(([group, entries]) =>
  entries.map(([id, ru, ky, family, form = 0]) => ({
    id,
    ru,
    ky,
    family,
    form,
    group: group as DeviceGroup,
  })),
);
export const illustrationColors = {
  graphite: "#555A52",
  cream: "#EAD7B5",
  copper: "#B9764D",
  sage: "#879486",
  white: "#DFE3DC",
} as const;
export type IllustrationConfig = {
  categoryId: string;
  color: keyof typeof illustrationColors;
  variant: "rounded" | "angular";
  details: "minimal" | "detailed";
};
export function defaultIllustration(
  categoryId = "unknown",
): IllustrationConfig {
  return {
    categoryId: deviceCatalog.some((x) => x.id === categoryId)
      ? categoryId
      : "unknown",
    color: categoryId.includes("lamp") ? "cream" : "graphite",
    variant: "rounded",
    details: "detailed",
  };
}
export function validateIllustrationConfig(
  value: unknown,
): IllustrationConfig | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const v = value as Record<string, unknown>,
    keys = Object.keys(v);
  if (
    keys.length !== 4 ||
    keys.some(
      (k) => !["categoryId", "color", "variant", "details"].includes(k),
    ) ||
    typeof v.categoryId !== "string" ||
    v.categoryId.length > 50 ||
    !deviceCatalog.some((x) => x.id === v.categoryId) ||
    typeof v.color !== "string" ||
    !Object.hasOwn(illustrationColors, v.color) ||
    !["rounded", "angular"].includes(v.variant as string) ||
    !["minimal", "detailed"].includes(v.details as string)
  )
    return null;
  return {
    categoryId: v.categoryId,
    color: v.color as IllustrationConfig["color"],
    variant: v.variant as IllustrationConfig["variant"],
    details: v.details as IllustrationConfig["details"],
  };
}
export function searchDevices(
  query: string,
  group?: DeviceGroup,
): readonly DeviceCategory[] {
  const words = query
    .trim()
    .toLocaleLowerCase()
    .slice(0, 80)
    .split(/\s+/)
    .filter(Boolean);
  return deviceCatalog.filter(
    (x) =>
      (!group || x.group === group) &&
      words.every((w) =>
        `${x.id} ${x.ru} ${x.ky}`.toLocaleLowerCase().includes(w),
      ),
  );
}
/** Future text-generation boundary. No model/service is connected. */
export interface IllustrationSuggestionProvider {
  readonly available: boolean;
  suggest(description: string): Promise<IllustrationConfig[]>;
}
export const offlineSuggestionProvider: IllustrationSuggestionProvider = {
  available: false,
  async suggest() {
    throw new Error("ai-illustration-provider-not-connected");
  },
};
