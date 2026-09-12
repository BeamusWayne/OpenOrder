import { sql } from "drizzle-orm";
import type { Database } from "@openorder/db";
import {
  brands,
  categories,
  inventory,
  items,
  modifierGroups,
  modifiers,
  skus,
  stores,
} from "@openorder/db";
import { IDS } from "./ids.js";

const DEFAULT_POINT = { latitude: "31.230400", longitude: "121.473700" };

export async function seedCatalog(db: Database) {
  await db.execute(sql`
    TRUNCATE
      metric_counters,
      idempotency_keys,
      messages,
      threads,
      payments,
      order_events,
      order_lines,
      orders,
      cart_lines,
      carts,
      inventory,
      modifiers,
      modifier_groups,
      skus,
      items,
      categories,
      stores,
      brands,
      customers
    RESTART IDENTITY CASCADE
  `);

  await db.insert(brands).values([
    { id: IDS.brands.luckin, name: "瑞幸咖啡", slug: "luckin" },
    { id: IDS.brands.mixue, name: "蜜雪冰城", slug: "mixue" },
    { id: IDS.brands.chabaidao, name: "茶百道", slug: "chabaidao" },
    { id: IDS.brands.heytea, name: "喜茶", slug: "heytea" },
    { id: IDS.brands.nayuki, name: "奈雪的茶", slug: "nayuki" },
  ]);

  await db.insert(stores).values([
    {
      id: IDS.stores.luckinNanjing,
      brandId: IDS.brands.luckin,
      name: "瑞幸咖啡 南京西路店",
      city: "上海",
      address: "静安区南京西路1266号",
      latitude: "31.230900",
      longitude: "121.459800",
      rating: "4.8",
      openHour: 7,
      closeHour: 22,
    },
    {
      id: IDS.stores.luckinXintiandi,
      brandId: IDS.brands.luckin,
      name: "瑞幸咖啡 新天地店",
      city: "上海",
      address: "黄浦区太仓路181号",
      latitude: "31.220800",
      longitude: "121.474900",
      rating: "4.7",
      openHour: 7,
      closeHour: 23,
    },
    {
      id: IDS.stores.mixuePeople,
      brandId: IDS.brands.mixue,
      name: "蜜雪冰城 人民广场店",
      city: "上海",
      address: "黄浦区南京东路",
      ...DEFAULT_POINT,
      rating: "4.6",
      openHour: 9,
      closeHour: 22,
    },
    {
      id: IDS.stores.mixueYangpu,
      brandId: IDS.brands.mixue,
      name: "蜜雪冰城 杨浦店",
      city: "上海",
      address: "杨浦区四平路",
      latitude: "31.273100",
      longitude: "121.508800",
      rating: "4.5",
      openHour: 9,
      closeHour: 22,
    },
    {
      id: IDS.stores.chabaidaoJingan,
      brandId: IDS.brands.chabaidao,
      name: "茶百道 静安寺店",
      city: "上海",
      address: "静安区南京西路",
      latitude: "31.223500",
      longitude: "121.447200",
      rating: "4.7",
      openHour: 10,
      closeHour: 22,
    },
    {
      id: IDS.stores.heyteaLujiazui,
      brandId: IDS.brands.heytea,
      name: "喜茶 陆家嘴店",
      city: "上海",
      address: "浦东新区陆家嘴环路",
      latitude: "31.239200",
      longitude: "121.499700",
      rating: "4.8",
      openHour: 10,
      closeHour: 22,
    },
    {
      id: IDS.stores.nayukiXujiahui,
      brandId: IDS.brands.nayuki,
      name: "奈雪的茶 徐家汇店",
      city: "上海",
      address: "徐汇区虹桥路",
      latitude: "31.194600",
      longitude: "121.436500",
      rating: "4.6",
      openHour: 10,
      closeHour: 22,
    },
  ]);

  const drinksCategory = "66666666-6666-4666-8666-666666666601";
  await db.insert(categories).values([
    { id: drinksCategory, storeId: IDS.stores.luckinNanjing, name: "人气咖啡", sortOrder: 1 },
    { id: "66666666-6666-4666-8666-666666666602", storeId: IDS.stores.luckinXintiandi, name: "人气咖啡", sortOrder: 1 },
    { id: "66666666-6666-4666-8666-666666666611", storeId: IDS.stores.mixuePeople, name: "冰城必喝", sortOrder: 1 },
    { id: "66666666-6666-4666-8666-666666666621", storeId: IDS.stores.chabaidaoJingan, name: "鲜茶", sortOrder: 1 },
    { id: "66666666-6666-4666-8666-666666666631", storeId: IDS.stores.heyteaLujiazui, name: "当季", sortOrder: 1 },
    { id: "66666666-6666-4666-8666-666666666641", storeId: IDS.stores.nayukiXujiahui, name: "果茶", sortOrder: 1 },
  ]);

  await db.insert(items).values([
    {
      id: IDS.items.coconutLatte,
      categoryId: drinksCategory,
      name: "生椰拿铁",
      description: "厚椰乳与浓缩咖啡",
    },
    {
      id: IDS.items.american,
      categoryId: drinksCategory,
      name: "美式咖啡",
      description: "经典浓缩加水",
    },
    {
      id: IDS.items.limitedCoconut,
      categoryId: drinksCategory,
      name: "限量生椰拿铁",
      description: "每日限量，用于并发超卖测试",
    },
    {
      id: IDS.items.lemonWater,
      categoryId: "66666666-6666-4666-8666-666666666611",
      name: "柠檬水",
      description: "鲜柠檬手打",
    },
    {
      id: IDS.items.iceCreamTea,
      categoryId: "66666666-6666-4666-8666-666666666611",
      name: "冰淇淋红茶",
      description: "红茶配冰淇淋",
    },
    {
      id: IDS.items.brownSugar,
      categoryId: "66666666-6666-4666-8666-666666666621",
      name: "褐糖珍珠奶茶",
      description: "热珍珠与牛乳",
    },
    {
      id: IDS.items.cheeseTea,
      categoryId: "66666666-6666-4666-8666-666666666631",
      name: "多肉葡萄",
      description: "芝士与葡萄果肉",
    },
    {
      id: IDS.items.grapeSnow,
      categoryId: "66666666-6666-4666-8666-666666666641",
      name: "霸气葡萄",
      description: "葡萄果粒与绿茶",
    },
    {
      id: IDS.items.coconutLatteXintiandi,
      categoryId: "66666666-6666-4666-8666-666666666602",
      name: "生椰拿铁",
      description: "厚椰乳与浓缩咖啡",
    },
  ]);

  await db.insert(skus).values([
    { id: IDS.skus.coconutLatteMedium, itemId: IDS.items.coconutLatte, name: "生椰拿铁 中杯", size: "中", basePriceCents: 1800 },
    { id: IDS.skus.americanMedium, itemId: IDS.items.american, name: "美式咖啡 中杯", size: "中", basePriceCents: 1200 },
    { id: IDS.skus.limitedTwoLeft, itemId: IDS.items.limitedCoconut, name: "限量生椰拿铁 中杯", size: "中", basePriceCents: 1900 },
    { id: IDS.skus.soldOutLatte, itemId: IDS.items.coconutLatte, name: "生椰拿铁 大杯", size: "大", basePriceCents: 2100 },
    { id: IDS.skus.lemonWaterLarge, itemId: IDS.items.lemonWater, name: "柠檬水 大杯", size: "大", basePriceCents: 600 },
    { id: IDS.skus.iceCreamTeaMedium, itemId: IDS.items.iceCreamTea, name: "冰淇淋红茶 中杯", size: "中", basePriceCents: 800 },
    { id: IDS.skus.brownSugarLarge, itemId: IDS.items.brownSugar, name: "褐糖珍珠奶茶 大杯", size: "大", basePriceCents: 1600 },
    { id: IDS.skus.cheeseTeaMedium, itemId: IDS.items.cheeseTea, name: "多肉葡萄 中杯", size: "中", basePriceCents: 2500 },
    { id: IDS.skus.grapeSnowMedium, itemId: IDS.items.grapeSnow, name: "霸气葡萄 中杯", size: "中", basePriceCents: 2600 },
    { id: IDS.skus.coconutLatteXintiandi, itemId: IDS.items.coconutLatteXintiandi, name: "生椰拿铁 中杯", size: "中", basePriceCents: 1800 },
  ]);

  const sugarGroup = "77777777-7777-4777-8777-777777777701";
  const iceGroup = "77777777-7777-4777-8777-777777777702";
  await db.insert(modifierGroups).values([
    { id: sugarGroup, itemId: IDS.items.coconutLatte, name: "糖度", required: true, minSelect: 1, maxSelect: 1 },
    { id: iceGroup, itemId: IDS.items.coconutLatte, name: "冰量", required: true, minSelect: 1, maxSelect: 1 },
    { id: "77777777-7777-4777-8777-777777777711", itemId: IDS.items.limitedCoconut, name: "糖度", required: true, minSelect: 1, maxSelect: 1 },
  ]);

  await db.insert(modifiers).values([
    { id: IDS.modifiers.sugarLess, groupId: sugarGroup, name: "少糖", priceDeltaCents: 0 },
    { id: IDS.modifiers.sugarHalf, groupId: sugarGroup, name: "半糖", priceDeltaCents: 0 },
    { id: IDS.modifiers.sugarFull, groupId: sugarGroup, name: "标准糖", priceDeltaCents: 0 },
    { id: IDS.modifiers.iceLess, groupId: iceGroup, name: "少冰", priceDeltaCents: 0 },
    { id: IDS.modifiers.iceNormal, groupId: iceGroup, name: "正常冰", priceDeltaCents: 0 },
    { id: IDS.modifiers.iceNone, groupId: iceGroup, name: "去冰", priceDeltaCents: 0 },
    { id: "55555555-5555-4555-8555-555555555521", groupId: "77777777-7777-4777-8777-777777777711", name: "少糖", priceDeltaCents: 0 },
  ]);

  await db.insert(inventory).values([
    { skuId: IDS.skus.coconutLatteMedium, quantity: 48 },
    { skuId: IDS.skus.americanMedium, quantity: 60 },
    { skuId: IDS.skus.limitedTwoLeft, quantity: 2 },
    { skuId: IDS.skus.soldOutLatte, quantity: 0 },
    { skuId: IDS.skus.lemonWaterLarge, quantity: 80 },
    { skuId: IDS.skus.iceCreamTeaMedium, quantity: 40 },
    { skuId: IDS.skus.brownSugarLarge, quantity: 30 },
    { skuId: IDS.skus.cheeseTeaMedium, quantity: 20 },
    { skuId: IDS.skus.grapeSnowMedium, quantity: 18 },
    { skuId: IDS.skus.coconutLatteXintiandi, quantity: 36 },
  ]);
}
