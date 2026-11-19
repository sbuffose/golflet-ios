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
    }
  };
})(window);
