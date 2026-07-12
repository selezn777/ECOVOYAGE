import type { Locale } from "@/i18n/config";

type TourCopy = {
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  patterns: RegExp[];
};

const TOUR_COPIES: TourCopy[] = [
  {
    name: { ru: "Далат Чудес", en: "Da Lat Wonders", vi: "Da Lat Ky Dieu" },
    description: {
      ru: "Горный тур в Далат: водопады, кофейные плантации, смотровые площадки и самые яркие локации плато Ламдонг.",
      en: "A mountain tour to Da Lat with waterfalls, coffee plantations, viewpoints and the brightest locations of the Lam Dong plateau.",
      vi: "Tour cao nguyen Da Lat voi thac nuoc, doi ca phe, diem ngam canh va nhung dia diem noi bat cua Lam Dong.",
    },
    patterns: [/da\s*lat\s*chudes/i, /далат\s*чудес/i],
  },
  {
    name: { ru: "Далат Лайт", en: "Da Lat Light", vi: "Da Lat Light" },
    description: {
      ru: "Облегченная программа Далата на один день: красивые виды, городские локации, кофе и мягкий темп без перегруза.",
      en: "A lighter one-day Da Lat program with scenic views, city highlights, coffee and a comfortable pace.",
      vi: "Chuong trinh Da Lat mot ngay nhe nhang voi canh dep, diem noi bat trong thanh pho, ca phe va lich trinh thoai mai.",
    },
    patterns: [/da\s*lat\s*light/i, /далат\s*light/i, /далат\s*лайт/i],
  },
  {
    name: { ru: "Далат VIP", en: "Da Lat VIP", vi: "Da Lat VIP" },
    description: {
      ru: "Расширенный маршрут по Далату с комфортным темпом, премиальными остановками и акцентом на впечатления.",
      en: "An extended Da Lat route with a comfortable pace, premium stops and a stronger focus on experience.",
      vi: "Tuyen Da Lat mo rong voi nhip do thoai mai, diem dung cao cap va trai nghiem noi bat.",
    },
    patterns: [/da\s*lat\s*vip/i, /далат\s*vip/i],
  },
  {
    name: { ru: "Далат Discovery 2 дня", en: "Da Lat Discovery 2 Days", vi: "Da Lat Discovery 2 ngay" },
    description: {
      ru: "Двухдневная поездка в Далат с ночевкой, насыщенной программой, природой, городом и вечерней атмосферой.",
      en: "A two-day Da Lat trip with an overnight stay, nature, city highlights and the evening atmosphere of the mountains.",
      vi: "Chuyen di Da Lat 2 ngay co nghi dem, thien nhien, diem thanh pho va khong khi buoi toi tren cao nguyen.",
    },
    patterns: [/dalat\s*discovery/i, /da\s*lat\s*2/i, /далат\s*2/i],
  },
  {
    name: { ru: "Остров Хон Там", en: "Hon Tam Island", vi: "Dao Hon Tam" },
    description: {
      ru: "Морской день на острове Хон Там: пляж, прозрачная вода, отдых, бассейн и дополнительные водные активности.",
      en: "A sea day on Hon Tam Island with beach time, clear water, relaxation, pool access and optional water activities.",
      vi: "Mot ngay bien tai dao Hon Tam voi bai tam, nuoc trong, nghi ngoi, ho boi va cac hoat dong duoi nuoc tuy chon.",
    },
    patterns: [/hon\s*tam/i, /хон\s*там/i],
  },
  {
    name: { ru: "Северные острова", en: "Northern Islands", vi: "Cac dao phia Bac" },
    description: {
      ru: "Маршрут по северным островам Нячанга: остров Орхидей, остров Обезьян, пляжный отдых и природные локации.",
      en: "A route through Nha Trang's northern islands: Orchid Island, Monkey Island, beach time and nature locations.",
      vi: "Tuyen cac dao phia Bac Nha Trang: dao Hoa Lan, dao Khi, bai bien va cac diem thien nhien.",
    },
    patterns: [/northern\s*islands/i, /северн.*остров/i, /орхидей.*обезьян/i],
  },
  {
    name: { ru: "Ба Хо и пляж TTC", en: "Ba Ho Waterfalls and TTC Beach", vi: "Thac Ba Ho va bai TTC" },
    description: {
      ru: "Активный день с водопадами Ба Хо, джунглями, купанием и спокойным отдыхом на пляже TTC.",
      en: "An active day with Ba Ho waterfalls, jungle scenery, swimming and relaxed time on TTC Beach.",
      vi: "Mot ngay nang dong voi thac Ba Ho, rung nhiet doi, tam suoi va nghi ngoi tai bai TTC.",
    },
    patterns: [/ba\s*ho.*ttc/i, /ба\s*хо.*ttc/i, /бахо.*ttc/i, /водопад.*ба\s*хо/i],
  },
  {
    name: { ru: "Ба Хо", en: "Ba Ho", vi: "Ba Ho" },
    description: {
      ru: "Природный маршрут к водопадам Ба Хо: джунгли, каменные чаши, купание и прогулка по заповеднику.",
      en: "A nature route to Ba Ho waterfalls with jungle paths, stone pools, swimming and a reserve walk.",
      vi: "Tuyen thien nhien den thac Ba Ho voi duong rung, ho da, tam suoi va di bo trong khu bao ton.",
    },
    patterns: [/ba\s*ho/i, /ба\s*хо/i, /бахо/i],
  },
  {
    name: { ru: "Фанранг", en: "Phan Rang", vi: "Phan Rang" },
    description: {
      ru: "Южный маршрут в Фанранг: храмы, смотровые площадки, пляж, местная культура и необычные ландшафты.",
      en: "A southern route to Phan Rang with temples, viewpoints, beach time, local culture and unusual landscapes.",
      vi: "Tuyen phia Nam den Phan Rang voi den chua, diem ngam canh, bai bien, van hoa dia phuong va canh quan doc dao.",
    },
    patterns: [/phan\s*rang/i, /фанранг/i],
  },
  {
    name: { ru: "Маяк Дай Лань", en: "Dai Lanh Lighthouse", vi: "Hai dang Dai Lanh" },
    description: {
      ru: "Маршрут к маяку Дай Лань: ранний выезд, виды на море, дикий пляж, бухта Вунг Ро и фотолокации.",
      en: "A route to Dai Lanh Lighthouse with an early start, sea views, wild beach, Vung Ro Bay and photo stops.",
      vi: "Tuyen den hai dang Dai Lanh voi khoi hanh som, canh bien, bai hoang so, vinh Vung Ro va diem chup anh.",
    },
    patterns: [/lighthouse/i, /маяк/i, /dai\s*lanh/i],
  },
  {
    name: { ru: "Янг Бэй", en: "Yang Bay", vi: "Yang Bay" },
    description: {
      ru: "Природный парк Янг Бэй: водопад, термальные источники, прогулки, шоу и спокойный отдых среди зелени.",
      en: "Yang Bay nature park with a waterfall, hot springs, walks, local shows and relaxed time in the greenery.",
      vi: "Khu du lich Yang Bay voi thac nuoc, suoi khoang nong, di dao, bieu dien dia phuong va khong gian xanh.",
    },
    patterns: [/yang\s*bay/i, /янг\s*б[эе]й/i],
  },
  {
    name: { ru: "Premium Islands", en: "Premium Islands", vi: "Premium Islands" },
    description: {
      ru: "Премиальный морской маршрут по островам Нячанга: снорклинг, пляжи, обед и красивые локации бухты.",
      en: "A premium island route around Nha Trang Bay with snorkeling, beaches, lunch and beautiful bay locations.",
      vi: "Tuyen dao cao cap quanh vinh Nha Trang voi snorkeling, bai bien, an trua va cac diem dep trong vinh.",
    },
    patterns: [/premium\s*islands/i, /asia\s*mix/i, /азия\s*микс/i],
  },
  {
    name: { ru: "Дананг и Хойан 2 дня", en: "Da Nang and Hoi An 2 Days", vi: "Da Nang va Hoi An 2 ngay" },
    description: {
      ru: "Двухдневная поездка в Дананг и Хойан: слип-бас, Ba Na Hills, Мраморные горы, старый город и вечерние фонари.",
      en: "A two-day Da Nang and Hoi An trip with sleeper bus, Ba Na Hills, Marble Mountains, ancient town and evening lanterns.",
      vi: "Chuyen Da Nang va Hoi An 2 ngay voi xe giuong nam, Ba Na Hills, Ngu Hanh Son, pho co va den long buoi toi.",
    },
    patterns: [/danang.*hoi\s*an/i, /дананг.*хойан/i, /дананг\s*\+\s*хойан/i],
  },
  {
    name: { ru: "Дананг 1 день", en: "Da Nang 1 Day", vi: "Da Nang 1 ngay" },
    description: {
      ru: "Поездка в Дананг на один день: слип-бас, городские символы, Ba Na Hills и ключевые локации региона.",
      en: "A one-day Da Nang trip by sleeper bus with city landmarks, Ba Na Hills and the key regional highlights.",
      vi: "Chuyen Da Nang mot ngay bang xe giuong nam voi bieu tuong thanh pho, Ba Na Hills va cac diem noi bat.",
    },
    patterns: [/danang\s*1/i, /da\s*nang\s*1/i, /дананг\s*1/i],
  },
  {
    name: { ru: "Сайгон 1 день", en: "Saigon 1 Day", vi: "Sai Gon 1 ngay" },
    description: {
      ru: "Однодневный маршрут в Сайгон: городские символы, история, Меконг или Ку Чи в зависимости от программы.",
      en: "A one-day Saigon route with city landmarks, history, and Mekong Delta or Cu Chi depending on the program.",
      vi: "Tuyen Sai Gon mot ngay voi bieu tuong thanh pho, lich su, Mekong hoac Cu Chi tuy chuong trinh.",
    },
    patterns: [/saigon\s*1/i, /sai\s*gon\s*1/i, /сайгон\s*1/i],
  },
  {
    name: { ru: "Сайгон 2 дня", en: "Saigon 2 Days", vi: "Sai Gon 2 ngay" },
    description: {
      ru: "Двухдневный маршрут в Сайгон: слип-бас, Меконг, Ку Чи, городские достопримечательности и свободное время.",
      en: "A two-day Saigon route with sleeper bus, Mekong Delta, Cu Chi, city highlights and free time.",
      vi: "Tuyen Sai Gon 2 ngay voi xe giuong nam, Mekong, Cu Chi, diem thanh pho va thoi gian tu do.",
    },
    patterns: [/saigon\s*2/i, /sai\s*gon\s*2/i, /сайгон\s*2/i],
  },
  {
    name: { ru: "Озерная рыбалка", en: "Lake Fishing", vi: "Cau ca ho" },
    description: {
      ru: "Спокойная рыбалка на озере с гарантированным уловом, отдыхом на природе и понятной программой для семьи.",
      en: "A relaxed lake fishing tour with a high chance of catch, nature time and a family-friendly program.",
      vi: "Tour cau ca ho thu gian voi kha nang co ca cao, thoi gian ngoai thien nhien va lich trinh phu hop gia dinh.",
    },
    patterns: [/fishing\s*lake/i, /рыбалк.*озер/i, /озерн.*рыбал/i],
  },
  {
    name: { ru: "Морская рыбалка", en: "Sea Fishing", vi: "Cau ca bien" },
    description: {
      ru: "Морская рыбалка в бухте Нячанга: лодка, снасти, купание, обед и атмосферный день на воде.",
      en: "Sea fishing in Nha Trang Bay with boat, gear, swimming, lunch and a full day on the water.",
      vi: "Cau ca bien tai vinh Nha Trang voi tau, dung cu, tam bien, an trua va mot ngay tren bien.",
    },
    patterns: [/fishing\s*sea/i, /морск.*рыбал/i],
  },
  {
    name: { ru: "Дайвинг", en: "Diving", vi: "Lan bien" },
    description: {
      ru: "Дайвинг в бухте Нячанга: лодка, инструктор, кораллы, тропические рыбы и программа для новичков и уверенных гостей.",
      en: "Diving in Nha Trang Bay with boat, instructor, coral reefs, tropical fish and options for beginners or experienced guests.",
      vi: "Lan bien tai vinh Nha Trang voi tau, huong dan vien, san ho, ca nhiet doi va chuong trinh cho nguoi moi lan nguoi co kinh nghiem.",
    },
    patterns: [/diving/i, /дайвинг/i, /погружен/i],
  },
  {
    name: { ru: "Катамаран Закат", en: "Sunset Catamaran", vi: "Catamaran hoang hon" },
    description: {
      ru: "Вечерний выход на катамаране: море, закат, музыка, легкая атмосфера и красивые виды на бухту Нячанга.",
      en: "An evening catamaran cruise with sea views, sunset, music, relaxed atmosphere and Nha Trang Bay scenery.",
      vi: "Chuyen catamaran buoi toi voi bien, hoang hon, am nhac, khong khi thu gian va canh vinh Nha Trang.",
    },
    patterns: [/catamaran.*sunset/i, /катамаран.*закат/i],
  },
  {
    name: { ru: "Катамаран День", en: "Day Catamaran", vi: "Catamaran ban ngay" },
    description: {
      ru: "Дневной выход на катамаране: море, купание, отдых на борту и комфортная прогулка по бухте.",
      en: "A daytime catamaran cruise with swimming, onboard relaxation and a comfortable route around the bay.",
      vi: "Chuyen catamaran ban ngay voi tam bien, nghi ngoi tren tau va tuyen di thoai mai quanh vinh.",
    },
    patterns: [/catamaran.*day/i, /катамаран.*день/i],
  },
  {
    name: { ru: "Квадро и зиплайн", en: "Quad and Zipline", vi: "ATV va Zipline" },
    description: {
      ru: "Активная программа с квадроциклами, зиплайном, купанием в горной реке и обедом на природе.",
      en: "An active program with quad bikes, zipline, mountain river swimming and lunch in nature.",
      vi: "Chuong trinh nang dong voi xe ATV, zipline, tam suoi nui va an trua ngoai thien nhien.",
    },
    patterns: [/quad.*zip/i, /квадро.*зип/i, /комбо.*квадро/i],
  },
  {
    name: { ru: "Emperor Cruise", en: "Emperor Cruise", vi: "Emperor Cruise" },
    description: {
      ru: "Премиальный круиз по бухте Нячанга: яхта, закат, ужин, музыка и вечерняя атмосфера на воде.",
      en: "A premium Nha Trang Bay cruise with yacht setting, sunset, dinner, music and an evening atmosphere on the water.",
      vi: "Du thuyen cao cap tren vinh Nha Trang voi hoang hon, bua toi, am nhac va khong khi buoi toi tren bien.",
    },
    patterns: [/emperor/i, /круиз\s*emperor/i],
  },
  {
    name: { ru: "I-Resort Spa", en: "I-Resort Spa", vi: "I-Resort Spa" },
    description: {
      ru: "Спа-день в I-Resort: грязевые ванны, термальные бассейны, аквапарк и спокойный отдых без длинной дороги.",
      en: "A spa day at I-Resort with mud baths, thermal pools, water park and relaxed time without a long transfer.",
      vi: "Mot ngay spa tai I-Resort voi tam bun, ho khoang nong, cong vien nuoc va nghi ngoi nhe nhang.",
    },
    patterns: [/i-?resort/i, /грязев.*ванн/i],
  },
];

function normalizeTourText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ё/g, "е")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findTourCopy(rawName: string): TourCopy | null {
  const normalized = normalizeTourText(rawName);
  return TOUR_COPIES.find((tour) => tour.patterns.some((pattern) => pattern.test(normalized))) ?? null;
}

function safeLocale(locale?: string): Locale {
  return locale === "en" || locale === "vi" ? locale : "ru";
}

export function localizeTourName(rawName: string, locale?: string): string {
  const copy = findTourCopy(rawName);
  return copy?.name[safeLocale(locale)] ?? rawName;
}

export function localizeTourDescription(rawDescription: string | null | undefined, rawName: string, locale?: string): string {
  const copy = findTourCopy(rawName);
  if (copy) return copy.description[safeLocale(locale)];
  return String(rawDescription ?? "");
}

export function isKnownTourName(rawName: string): boolean {
  return Boolean(findTourCopy(rawName));
}
