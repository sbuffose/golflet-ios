/* Official photos and checked WITB. Same facts as web/lib/club-gear.ts. */
(function (root) {
  var PHOTOS = [
    { brand: "Titleist", model: "GT2", category: "driver", src: "/clubs/models/titleist-gt2-driver.jpg", alt: "Titleist GT2 Driver" },
    { brand: "Titleist", model: "GT2", category: "fairway", src: "/clubs/models/titleist-gt2-fairway.jpg", alt: "Titleist GT2 Fairway" },
    { brand: "Titleist", model: "T150", category: "iron", src: "/clubs/models/titleist-t150-iron.jpg", alt: "Titleist T150, catálogo 2023" }
  ];
  var PLAYERS = [
    { id: "zalatoris", brand: "Titleist", model: "GT2", category: "driver", name: "Will Zalatoris", tour: "PGA Tour", sourceUrl: "https://golfwrx.com/752701/will-zalatoris-witb-2025-january/", whenLabel: "14 ene 2025" },
    { id: "young", brand: "Titleist", model: "GT2", category: "driver", name: "Cameron Young", tour: "PGA Tour", sourceUrl: "https://golfwrx.com/761858/cameron-young-witb-2025-june/", whenLabel: "16 jun 2025" },
    { id: "cauley", brand: "Titleist", model: "GT2", category: "driver", name: "Bud Cauley", tour: "PGA Tour", sourceUrl: "https://golfwrx.com/761979/bud-cauley-witb-2025-june/", whenLabel: "18 jun 2025" },
    { id: "young", brand: "Titleist", model: "GT2", category: "fairway", name: "Cameron Young", tour: "PGA Tour", sourceUrl: "https://golfwrx.com/761858/cameron-young-witb-2025-june/", whenLabel: "16 jun 2025" },
    { id: "cauley", brand: "Titleist", model: "GT2", category: "fairway", name: "Bud Cauley", tour: "PGA Tour", sourceUrl: "https://golfwrx.com/761979/bud-cauley-witb-2025-june/", whenLabel: "18 jun 2025" },
    { id: "zalatoris", brand: "Titleist", model: "T150", category: "iron", name: "Will Zalatoris", tour: "PGA Tour", sourceUrl: "https://golfwrx.com/752701/will-zalatoris-witb-2025-january/", whenLabel: "14 ene 2025" }
  ];
  var norm = function (s) { return String(s || "").trim().toLowerCase(); };
  var photosOf = function (brand, model) {
    var b = norm(brand), m = norm(model);
    if (!b || !m) return [];
    return PHOTOS.filter(function (p) { return norm(p.brand) === b && norm(p.model) === m; });
  };
  var photo = function (brand, model, category) {
    var hits = photosOf(brand, model);
    if (hits.length === 1) return hits[0];
    if (!category) return null;
    return hits.filter(function (p) { return p.category === category; })[0] || null;
  };
  var categoryOf = function (brand, model, face) {
    var hit = photo(brand, model, face);
    if (hit) return hit.category;
    if (photosOf(brand, model).length > 1) return null;
    return face || null;
  };
  root.GolfletGear = {
    thumb: function (brand, model, category) {
      var hit = photo(brand, model, category);
      if (hit) return { kind: "photo", src: hit.src, alt: hit.alt };
      var face = category && /^(driver|fairway|hybrid|iron|wedge|putter)$/.test(category) ? category : "iron";
      return { kind: "silhouette", src: "/clubs/silhouettes/" + face + ".svg", alt: "Silueta" };
    },
    users: function (brand, model, category) {
      var resolved = categoryOf(brand, model, category);
      if (!resolved || !norm(model)) return [];
      var b = norm(brand), m = norm(model);
      return PLAYERS.filter(function (p) { return norm(p.brand) === b && norm(p.model) === m && p.category === resolved; });
    },
    /* Yardage rows have no brand. Mi bolsa does. Same names as web/lib/club-gear.ts TYPE_NAMES. */
    attach: function (bag, equipment) {
      var TYPES = [
        ["dr", "driver", ["driver"]], ["3w", "fairway", ["madera 3"]], ["5w", "fairway", ["madera 5"]],
        ["7w", "fairway", ["madera 7"]], ["9w", "fairway", ["madera 9"]], ["hy", "hybrid", ["hibrido"]],
        ["2h", "hybrid", ["hibrido 2"]], ["3h", "hybrid", ["hibrido 3"]], ["4h", "hybrid", ["hibrido 4"]],
        ["5h", "hybrid", ["hibrido 5"]], ["6h", "hybrid", ["hibrido 6"]], ["2i", "iron", ["hierro 2"]],
        ["3i", "iron", ["hierro 3"]], ["4i", "iron", ["hierro 4"]], ["5i", "iron", ["hierro 5"]],
        ["6i", "iron", ["hierro 6"]], ["7i", "iron", ["hierro 7"]], ["8i", "iron", ["hierro 8"]],
        ["9i", "iron", ["hierro 9"]], ["pw", "wedge", ["pw", "pitching wedge"]], ["gw", "wedge", ["gw", "gap wedge"]],
        ["sw", "wedge", ["sw", "sand wedge"]], ["lw", "wedge", ["lw", "lob wedge"]], ["pt", "putter", ["putter", "pt"]]
      ];
      var fold = function (value) { return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); };
      var expand = function (values) {
        var names = values.map(fold).filter(Boolean), category = "";
        TYPES.forEach(function (type) {
          if (names.indexOf(type[0]) >= 0 || type[2].some(function (name) { return names.indexOf(name) >= 0; })) {
            names.push(type[0]); type[2].forEach(function (name) { names.push(name); });
            if (!category) category = type[1];
          }
        });
        return { names: names, category: category };
      };
      var gear = (Array.isArray(equipment) ? equipment : []).map(function (item) {
        var row = item && typeof item === "object" ? item : {};
        var named = expand([row.code, row.label, row.bag, row.club, row.name]);
        var given = /^(driver|fairway|hybrid|iron|wedge|putter)$/.test(row.category || "") ? row.category : "";
        return { row: row, names: named.names, category: given || named.category };
      });
      return (Array.isArray(bag) ? bag : []).map(function (item) {
        if (!item || typeof item !== "object") return item;
        var want = expand([item.club, item.code, item.label, item.name, item.id]).names;
        var hit = null;
        gear.some(function (entry) { if (want.some(function (name) { return entry.names.indexOf(name) >= 0; })) { hit = entry; return true; } return false; });
        if (!hit) return item;
        var next = {};
        Object.keys(item).forEach(function (key) { next[key] = item[key]; });
        var brand = String(next.brand || hit.row.brand || "").trim();
        var model = String(next.model || next.model_name || hit.row.model || hit.row.model_name || "").trim();
        var category = /^(driver|fairway|hybrid|iron|wedge|putter)$/.test(next.category || "") ? next.category : hit.category;
        if (brand) next.brand = brand;
        if (model) next.model = model;
        if (category) next.category = category;
        return next;
      });
    }
  };
})(window);
