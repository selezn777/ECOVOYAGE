/**
 * Добавляет локации (с Google Maps ссылками) ко всем шаблонам туров.
 * Ссылки формата google.com/maps?q=... открывают нужную точку сразу.
 * Run: node scripts/seed-template-locations.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const env = Object.fromEntries(
  readFileSync(resolve(import.meta.dirname, "../.env.local"), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const eq = l.indexOf("="); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim().replace(/^"|"$/g, "")]; })
);

const supabase = createClient(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"], { auth: { persistSession: false } });

const gm = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const MARKER = "[[AMX_LOCATIONS_V1]]";

function buildDesc(base, locations) {
  const clean = locations.filter(l => l.name && l.mapUrl);
  if (!clean.length) return base;
  return `${base}\n\n${MARKER}\n${JSON.stringify(clean)}`;
}

// ─── ЛОКАЦИИ ПО ТУРАМ ─────────────────────────────────────────────────────────

const TOUR_LOCATIONS = {

  "Далат Чудес": [
    { name: "Горный перевал Пренн", description: "Панорамные виды на горы, утренний туман", mapUrl: gm("Prenn Pass Da Lat Vietnam"), recommendedTime: "06:30" },
    { name: "Кофейные плантации", description: "Арабика, робуста, дегустация настоящего вьетнамского кофе", mapUrl: gm("Coffee plantation Da Lat Vietnam") },
    { name: "Crazy House (Дом Хан Нга)", description: "Лабиринт без прямых линий, рекорд Гиннесса", mapUrl: gm("Crazy House Hang Nga Da Lat Vietnam"), recommendedTime: "08:00" },
    { name: "Водопад Датанла", description: "Каскадный водопад, электросани по желанию", mapUrl: gm("Datanla Waterfall Da Lat Vietnam"), recommendedTime: "09:30" },
    { name: "Ферма и зоопарк (Lucky Land)", description: "Капибары, люваки, слоны, кофе лювак", mapUrl: gm("Lucky Land Farm Zoo Da Lat Vietnam"), recommendedTime: "13:30" },
    { name: "Стеклянный мост", description: "325 м, высота 90 м над горами", mapUrl: gm("Glass Bridge Da Lat Vietnam"), recommendedTime: "15:00" },
    { name: "Пагода Линь Фуок", description: "Топ-10 Азии, мозаика из стекла, дракон из бутылок", mapUrl: gm("Linh Phuoc Pagoda Da Lat Vietnam"), recommendedTime: "16:00" },
    { name: "Глиняная деревня (Làng Đất Sét)", description: "Лики любви, глиняные скульптуры, арт-пространство", mapUrl: gm("Clay Tunnel Village Da Lat Vietnam"), recommendedTime: "17:00" },
  ],

  "Далат Light": [
    { name: "Горный перевал Пренн", description: "Панорамные виды, утренний туман", mapUrl: gm("Prenn Pass Da Lat Vietnam"), recommendedTime: "06:30" },
    { name: "Кофейные плантации", description: "Знакомство с вьетнамским кофе на плантации", mapUrl: gm("Coffee plantation Da Lat Vietnam") },
    { name: "Crazy House (Дом Хан Нга)", description: "Сказочный лабиринт, фотолокация", mapUrl: gm("Crazy House Hang Nga Da Lat Vietnam"), recommendedTime: "08:00" },
    { name: "Водопад Датанла", description: "Водопад среди хвойного леса, альпийские сани", mapUrl: gm("Datanla Waterfall Da Lat Vietnam"), recommendedTime: "09:30" },
    { name: "XQ — шелковая галерея", description: "Сады, картины из шелка, арт-пространство", mapUrl: gm("XQ Art Gallery Da Lat Vietnam"), recommendedTime: "11:00" },
    { name: "Парк цветов Далата", description: "Тысячи цветов, озеро Суан Хыонг, фестиваль цветов", mapUrl: gm("Dalat Flower Garden Vietnam"), recommendedTime: "12:30" },
    { name: "Озеро любви", description: "Романтичная локация, аллеи, цветы", mapUrl: gm("Love Lake Da Lat Vietnam"), recommendedTime: "13:30" },
    { name: "Зоопарк и кофейные плантации", description: "Кофе лювак, капибары, слоны", mapUrl: gm("Lucky Land Farm Zoo Da Lat Vietnam"), recommendedTime: "15:00" },
  ],

  "Далат VIP": [
    { name: "Пагода Линь Фуок", description: "Мозаика, огромный дракон, задаёт настроение дня", mapUrl: gm("Linh Phuoc Pagoda Da Lat Vietnam"), recommendedTime: "06:30" },
    { name: "Горный поезд Траймат", description: "Узкоколейка 1930-х, туман, французский вокзал", mapUrl: gm("Trai Mat Train Station Da Lat Vietnam"), recommendedTime: "07:30" },
    { name: "Дегустация продуктов Далата", description: "Цукаты, артишок, горный чай", mapUrl: gm("Dalat market specialty food Vietnam") },
    { name: "Стеклянный мост", description: "Адреналин, виды, тюбинг", mapUrl: gm("Glass Bridge Da Lat Vietnam"), recommendedTime: "10:00" },
    { name: "Crazy House (Дом Хан Нга)", description: "Лабиринт без прямых линий", mapUrl: gm("Crazy House Hang Nga Da Lat Vietnam"), recommendedTime: "14:30" },
    { name: "Ферма лювака и зоопарк", description: "Кофе лювак, слоны, страусы", mapUrl: gm("Lucky Land Farm Zoo Da Lat Vietnam"), recommendedTime: "16:00" },
  ],

  "Dalat Discovery (2 дня)": [
    { name: "Горный перевал Пренн", description: "Панорамы, туман, серпантины", mapUrl: gm("Prenn Pass Da Lat Vietnam"), recommendedTime: "06:30" },
    { name: "Водопад Датанла", description: "Спуск на электросанях включён", mapUrl: gm("Datanla Waterfall Da Lat Vietnam"), recommendedTime: "08:00" },
    { name: "Crazy House (Дом Хан Нга)", description: "Лабиринт из снов архитектора", mapUrl: gm("Crazy House Hang Nga Da Lat Vietnam"), recommendedTime: "09:30" },
    { name: "Канатная дорога Далата", description: "Над холмами и долинами", mapUrl: gm("Da Lat Cable Car Vietnam") },
    { name: "Глиняная деревня", description: "Лики любви, арт под открытым небом", mapUrl: gm("Clay Tunnel Village Da Lat Vietnam") },
    { name: "Пагода Линь Фуок", description: "Мозаика, дракон из бутылок", mapUrl: gm("Linh Phuoc Pagoda Da Lat Vietnam") },
    { name: "Ж/д вокзал Далата", description: "Французская архитектура, ретро-атмосфера", mapUrl: gm("Da Lat Railway Station Vietnam"), recommendedTime: "09:00" },
    { name: "Гималайский храм (Золотой барабан)", description: "Рекорд Гиннесса, духовное место региона", mapUrl: gm("Thien Vuong Co Sat Pagoda Golden Bell Da Lat Vietnam"), recommendedTime: "10:30" },
    { name: "Водопад Слона", description: "Мощный водопад, природная энергетика", mapUrl: gm("Elephant Waterfall Da Lat Vietnam"), recommendedTime: "14:00" },
    { name: "Кофейные плантации", description: "Дегустация, покупка кофе", mapUrl: gm("Coffee plantation Da Lat Vietnam") },
  ],

  "City Tour Нячанг": [
    { name: "Сад камней Хон Чонг", description: "Гигантские валуны у моря, символ Нячанга", mapUrl: gm("Hon Chong Rocks Nha Trang Vietnam"), recommendedTime: "09:00" },
    { name: "Башни По Нагар (XII в.)", description: "Цивилизация Чамов, священное место", mapUrl: gm("Po Nagar Cham Towers Nha Trang Vietnam"), recommendedTime: "10:00" },
    { name: "Пагода Лонг Шон", description: "Белый Будда 24 м, вид на город", mapUrl: gm("Long Son Pagoda Nha Trang Vietnam"), recommendedTime: "11:00" },
    { name: "Театр Do", description: "Современная архитектура, культурная площадка", mapUrl: gm("Do Theater Nha Trang Vietnam"), recommendedTime: "14:00" },
    { name: "Католический собор Нячанга", description: "Готика 1930-х, французская постройка", mapUrl: gm("Nha Trang Cathedral Vietnam"), recommendedTime: "14:30" },
  ],

  "Водопады Ба Хо + пляж ТТС": [
    { name: "Водопад Ба Хо", description: "Каскадные озёра, купание, джунгли", mapUrl: gm("Ba Ho Waterfall Nha Trang Vietnam"), recommendedTime: "08:00" },
    { name: "Пляж ТТС (Doc Let)", description: "Белый песок, спокойное море, отдых", mapUrl: gm("TTC Beach Doc Let Nha Trang Vietnam"), recommendedTime: "11:30" },
  ],

  "Бахо — джунгли и водопады": [
    { name: "Буддийский храм", description: "Тихое место, начало маршрута", mapUrl: gm("Buddhist Temple Ba Ho Nha Trang Vietnam"), recommendedTime: "09:00" },
    { name: "Заповедник Бахо", description: "Джунгли, горная река, валуны, купание", mapUrl: gm("Ba Ho Nature Reserve Nha Trang Vietnam"), recommendedTime: "10:00" },
  ],

  "Янг Бэй — водопад и горячие источники": [
    { name: "Эко-парк Янг Бэй", description: "Водопад, термальные источники 15–50°C, шоу народа Раглай", mapUrl: gm("Yang Bay Eco Park Nha Trang Vietnam"), recommendedTime: "08:30" },
  ],

  "Фанранг": [
    { name: "Храм Ту Ван (Храм Дракона)", description: "Мозаика из ракушек, драконий лабиринт", mapUrl: gm("Tu Van Temple Dragon Ninh Thuan Vietnam"), recommendedTime: "08:00" },
    { name: "Зоопарк Фанранга", description: "Контактный зоопарк: капибары, альпаки, сурикаты", mapUrl: gm("Phan Rang Zoo Ninh Thuan Vietnam"), recommendedTime: "09:30" },
    { name: "Храм Тран Сон Ко Ту", description: "Тихое место без туристов", mapUrl: gm("Tran Son Co Tu Temple Ninh Thuan Vietnam"), recommendedTime: "11:00" },
    { name: "Смотровая площадка", description: "Панорама: Фанранг, горы, море, виноградники", mapUrl: gm("Phan Rang viewpoint Ninh Thuan Vietnam"), recommendedTime: "11:30" },
    { name: "TTC Resort Ninh Thuan", description: "Аквапарк, чистый пляж, пальмы", mapUrl: gm("TTC Resort Ninh Thuan Vietnam"), recommendedTime: "14:00" },
  ],

  "Маяк — земля первого рассвета": [
    { name: "Кафе на рисовых полях (Tiêm Cafe Đồng Lúa)", description: "Завтрак с панорамным видом на рисовые поля", mapUrl: gm("Tiem Cafe Dong Lua Khanh Hoa Vietnam"), recommendedTime: "06:00" },
    { name: "Католический собор (Nhà Thờ Vạn Giã)", description: "Небольшой город, красивый собор", mapUrl: gm("Nha Tho Giao Xu Van Gia Khanh Hoa Vietnam"), recommendedTime: "07:00" },
    { name: "Маяк Дай Лань", description: "Живописная точка, мало туристов", mapUrl: gm("Dai Lanh Lighthouse Khanh Hoa Vietnam"), recommendedTime: "09:00" },
    { name: "Пляж Бай Мон", description: "Дикий пляж, нетронутая природа", mapUrl: gm("Bai Mon Beach Khanh Hoa Vietnam"), recommendedTime: "10:00" },
    { name: "Ресторан Hương Biển Vũng Rô", description: "Обед с видом на бухту Вунг Ро", mapUrl: gm("Vung Ro Bay Phu Yen Vietnam"), recommendedTime: "12:00" },
    { name: "Ферма жемчуга Hoàng Gia Pearl", description: "Выращивание жемчуга, покупка", mapUrl: gm("Hoang Gia Pearl Farm Nha Trang Vietnam"), recommendedTime: "15:00" },
  ],

  "Северные острова: Орхидей + Обезьян": [
    { name: "Остров Орхидей (Hòn Thị)", description: "Сады орхидей, шоу птиц, парк бабочек", mapUrl: gm("Orchid Island Hon Thi Nha Trang Vietnam"), recommendedTime: "08:30" },
    { name: "Остров Обезьян (Hòn Lao)", description: "Сотни обезьян, интерактивное шоу", mapUrl: gm("Monkey Island Hon Lao Nha Trang Vietnam"), recommendedTime: "11:00" },
  ],

  "Asia Mix Islands — 3 острова": [
    { name: "Снорклинг-спот (открытое море)", description: "Кораллы, тропические рыбы", mapUrl: gm("Nha Trang Bay snorkeling Vietnam") },
    { name: "Остров Хон Там", description: "Белый песок, прозрачная вода, водные развлечения", mapUrl: gm("Hon Tam Island Nha Trang Vietnam"), recommendedTime: "09:00" },
    { name: "Бухта Санхо", description: "Обед, бассейн, пенная вечеринка", mapUrl: gm("Sanho Bay Nha Trang Vietnam"), recommendedTime: "12:00" },
    { name: "Корабль океанографии", description: "Аквариумы, водные горки", mapUrl: gm("Oceanography Institute Nha Trang Vietnam"), recommendedTime: "14:00" },
  ],

  "Остров Хон Там": [
    { name: "Снорклинг в море", description: "Чистая вода, маски включены", mapUrl: gm("Nha Trang Bay snorkeling Vietnam"), recommendedTime: "09:00" },
    { name: "Остров Хон Там", description: "Пляж, бассейн, SeaWalking", mapUrl: gm("Hon Tam Island Nha Trang Vietnam"), recommendedTime: "10:00" },
    { name: "Рыбацкая деревня", description: "Традиционный уклад жизни на воде", mapUrl: gm("Fishing Village Nha Trang Bay Vietnam") },
    { name: "Бухта Санхо", description: "Обед, бассейн, пенная вечеринка", mapUrl: gm("Sanho Bay Nha Trang Vietnam"), recommendedTime: "12:00" },
  ],

  "Дайвинг — 2 погружения": [
    { name: "Порт Нячанга (Cầu Đá)", description: "Встреча, посадка на дайвбот", mapUrl: gm("Cau Da Port Nha Trang Vietnam"), recommendedTime: "07:40" },
    { name: "Спот Дам Бэй (Hòn Tre)", description: "Кораллы, тропические рыбы, глубина до 6 м", mapUrl: gm("Dam Bay Hon Tre Nha Trang diving Vietnam"), recommendedTime: "09:00" },
  ],

  "Снорклинг": [
    { name: "Порт Нячанга (Cầu Đá)", description: "Встреча, посадка на дайвбот", mapUrl: gm("Cau Da Port Nha Trang Vietnam"), recommendedTime: "07:40" },
    { name: "Снорклинг-споты у Хон Тре", description: "Кораллы и рыбы у острова Хон Тре", mapUrl: gm("Hon Tre Island snorkeling Nha Trang Vietnam"), recommendedTime: "09:00" },
  ],

  "Рыбалка морская": [
    { name: "Порт Нячанга (Cầu Đá)", description: "Старт маршрута", mapUrl: gm("Cau Da Port Nha Trang Vietnam"), recommendedTime: "07:30" },
    { name: "Острова Хон Мун / Хон Миеу", description: "Рыбалка, снорклинг, купание", mapUrl: gm("Hon Mun Island Marine Protected Area Nha Trang Vietnam") },
    { name: "Плавучая рыбацкая деревня", description: "Готовим ваш улов, обед", mapUrl: gm("Floating fishing village Nha Trang Bay Vietnam") },
  ],

  "Рыбалка озёрная": [
    { name: "Озеро Суой Дау", description: "Рыбалка с гарантированным уловом", mapUrl: gm("Suoi Dau Lake Nha Trang Vietnam"), recommendedTime: "08:30" },
  ],

  "Зиплайн": [
    { name: "Парк Хон Ба", description: "Зиплайн, горная река, купание", mapUrl: gm("Zipline adventure park Nha Trang Vietnam"), recommendedTime: "08:30" },
  ],

  "Квадроциклы": [
    { name: "Парк Хон Ба", description: "Квадроциклы 4 км, горная трасса", mapUrl: gm("Quad bike adventure Nha Trang Vietnam"), recommendedTime: "08:30" },
  ],

  "Комбо: квадро + зиплайн + обед": [
    { name: "Парк Хон Ба", description: "Квадро + зиплайн + купание в реке + обед", mapUrl: gm("Adventure park zipline quad Nha Trang Vietnam"), recommendedTime: "08:30" },
  ],

  "Круиз Emperor 5★ — закат и ужин": [
    { name: "Причал Emperor Cruises", description: "Посадка на яхту", mapUrl: gm("Emperor Cruises Nha Trang Vietnam"), recommendedTime: "15:45" },
    { name: "Бухта Нячанга", description: "Закат над бухтой, ужин, музыка", mapUrl: gm("Nha Trang Bay sunset Vietnam") },
  ],

  "I-Resort Spa — грязевые ванны": [
    { name: "I-Resort Spa Нячанг", description: "Грязевые ванны, термальные источники, аквапарк", mapUrl: gm("I-Resort Spa Nha Trang Vietnam"), recommendedTime: "08:30" },
  ],

  "Дананг — 1 день (sleep-bus)": [
    { name: "Автовокзал Нячанга (Phía Nam)", description: "Посадка на VIP sleep-bus", mapUrl: gm("Nha Trang Southern Bus Station Vietnam"), recommendedTime: "19:00" },
    { name: "Мост Дракона (Cầu Rồng)", description: "Символ Дананга, вид на реку Хан", mapUrl: gm("Dragon Bridge Da Nang Vietnam"), recommendedTime: "07:30" },
    { name: "Ba Na Hills", description: "Золотой мост, Руки Бога, Французская деревня", mapUrl: gm("Ba Na Hills Da Nang Vietnam"), recommendedTime: "08:30" },
  ],

  "Дананг + Хойан — 2 дня (sleep-bus)": [
    { name: "Автовокзал Нячанга", description: "Посадка на VIP sleep-bus", mapUrl: gm("Nha Trang Southern Bus Station Vietnam"), recommendedTime: "19:00" },
    { name: "Мост Дракона", description: "Символ Дананга", mapUrl: gm("Dragon Bridge Da Nang Vietnam") },
    { name: "Ba Na Hills", description: "Золотой мост, Руки Бога, канатная дорога", mapUrl: gm("Ba Na Hills Da Nang Vietnam"), recommendedTime: "08:30" },
    { name: "Кокосовые лодочки (Cam Thanh)", description: "Круглые лодки в мангровых рощах", mapUrl: gm("Cam Thanh Coconut Village Hoi An Vietnam"), recommendedTime: "08:00" },
    { name: "Мраморные горы (Ngũ Hành Sơn)", description: "Пещеры, храмы, смотровые площадки", mapUrl: gm("Marble Mountains Da Nang Vietnam") },
    { name: "Старый город Хойан", description: "ЮНЕСКО, фонарики, атмосфера", mapUrl: gm("Hoi An Ancient Town Vietnam"), recommendedTime: "19:30" },
  ],

  "Сайгон — 1 день (sleep-bus)": [
    { name: "Автовокзал Нячанга", description: "Посадка на VIP sleep-bus", mapUrl: gm("Nha Trang Southern Bus Station Vietnam"), recommendedTime: "20:00" },
    { name: "Главный почтамт Сайгона", description: "Французская архитектура, открыт для туристов", mapUrl: gm("Saigon Central Post Office Ho Chi Minh City Vietnam") },
    { name: "Собор Нотр-Дам де Сайгон", description: "Готика XIX века", mapUrl: gm("Notre Dame Cathedral Saigon Ho Chi Minh Vietnam") },
    { name: "Дельта Меконга (Ми Тхо)", description: "Лодки, острова, дегустация фруктов", mapUrl: gm("My Tho Mekong Delta Vietnam") },
    { name: "Туннели Кучи", description: "Подземные ходы времён войны", mapUrl: gm("Cu Chi Tunnels Ho Chi Minh Vietnam") },
  ],

  "Сайгон — 2 дня (sleep-bus)": [
    { name: "Автовокзал Нячанга", description: "Посадка на VIP sleep-bus", mapUrl: gm("Nha Trang Southern Bus Station Vietnam"), recommendedTime: "20:30" },
    { name: "Дельта Меконга (Ми Тхо)", description: "Лодки, острова, ремёсла", mapUrl: gm("My Tho Mekong Delta Vietnam") },
    { name: "Туннели Ку Чи", description: "История войны, подземные ходы", mapUrl: gm("Cu Chi Tunnels Ho Chi Minh Vietnam") },
    { name: "Музей Вьетнамской войны", description: "История, документальные экспозиции", mapUrl: gm("War Remnants Museum Ho Chi Minh Vietnam") },
    { name: "Рынок Бен Тхань", description: "Сувениры, еда, атмосфера Сайгона", mapUrl: gm("Ben Thanh Market Ho Chi Minh Vietnam") },
  ],

  "Ханой + Халонг — 3 дня": [
    { name: "Аэропорт Нячанга (Камрань)", description: "Вылет в Ханой", mapUrl: gm("Cam Ranh Airport Nha Trang Vietnam"), recommendedTime: "06:00" },
    { name: "Мавзолей Хо Ши Мина", description: "Площадь Ба Динь, мемориальный комплекс", mapUrl: gm("Ho Chi Minh Mausoleum Hanoi Vietnam") },
    { name: "Озеро Хоан Кием", description: "Башня Черепахи, храм Нгок Сон", mapUrl: gm("Hoan Kiem Lake Hanoi Vietnam") },
    { name: "Храм Литературы", description: "XI век, первый университет Вьетнама", mapUrl: gm("Temple of Literature Hanoi Vietnam") },
    { name: "Поезд-кафе (Train Street)", description: "Кафе в метре от поезда — легендарная точка", mapUrl: gm("Hanoi Train Street Vietnam") },
    { name: "Бухта Халонг", description: "Тысячи известняковых островов, круиз", mapUrl: gm("Ha Long Bay Vietnam") },
  ],

  "Ханой + Халонг + Нинь Бинь — 4 дня": [
    { name: "Аэропорт Нячанга (Камрань)", description: "Вылет в Ханой", mapUrl: gm("Cam Ranh Airport Nha Trang Vietnam") },
    { name: "Мавзолей Хо Ши Мина", description: "Площадь Ба Динь", mapUrl: gm("Ho Chi Minh Mausoleum Hanoi Vietnam") },
    { name: "Хоалы", description: "Первая столица Вьетнама IX–X вв.", mapUrl: gm("Hoa Lu Ancient Capital Ninh Binh Vietnam") },
    { name: "Чанган", description: "Водная прогулка среди известняковых гор", mapUrl: gm("Trang An Ninh Binh Vietnam") },
    { name: "Пещера Муа", description: "Подъём на вершину, панорама всей долины", mapUrl: gm("Mua Cave Ninh Binh Vietnam") },
    { name: "Бухта Халонг", description: "Скалы, пещеры, ночёвка на борту", mapUrl: gm("Ha Long Bay Vietnam") },
  ],
};

// ─── ОБНОВЛЕНИЕ ───────────────────────────────────────────────────────────────

async function main() {
  const { data: templates, error } = await supabase
    .from("tour_templates")
    .select("id,name,description")
    .eq("active", true);

  if (error) { console.error("❌", error.message); process.exit(1); }

  console.log(`\nОбновляем локации для ${Object.keys(TOUR_LOCATIONS).length} шаблонов...\n`);

  let ok = 0, skip = 0;

  for (const tmpl of templates) {
    const locations = TOUR_LOCATIONS[tmpl.name];
    if (!locations?.length) {
      console.log(`  ⏭  ${tmpl.name} — нет локаций в скрипте`);
      skip++;
      continue;
    }

    // Берём base description (без старых локаций если были)
    const baseDesc = String(tmpl.description || "");
    const markerIdx = baseDesc.indexOf("[[AMX_LOCATIONS_V1]]");
    const cleanBase = markerIdx >= 0 ? baseDesc.slice(0, markerIdx).trimEnd() : baseDesc;

    const newDesc = buildDesc(cleanBase, locations);

    const { error: upErr } = await supabase
      .from("tour_templates")
      .update({ description: newDesc })
      .eq("id", tmpl.id);

    if (upErr) {
      console.log(`  ❌ ${tmpl.name}: ${upErr.message}`);
    } else {
      console.log(`  ✓  ${tmpl.name} — ${locations.length} локаций`);
      ok++;
    }
  }

  console.log(`\n✅ Готово: ${ok} обновлено, ${skip} пропущено\n`);
}

await main();
