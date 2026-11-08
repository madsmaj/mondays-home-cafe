import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Navbar, Footer } from "../components/Layout";
import { addToCart } from "../lib/cart";
import { getDb } from "../lib/firebase";

const groups = [
  ["rice", "Rice & Sandwiches"],
  ["specialty", "Specialty Drinks"],
  ["coffee", "Coffee & Drinks"],
];

// Firestore may contain either the original short categories (rice/coffee)
// or the display labels. Normalize both to the IDs used by the page.
function normalizeCategory(category) {
  const value = String(category || "").toLowerCase().trim();

  if (value === "rice" || value === "rice & sandwiches") return "rice";
  if (value === "specialty" || value === "specialty drinks") return "specialty";
  if (value === "coffee" || value === "coffee & drinks") return "coffee";

  return value;
}

export default function Menu() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState({});
  const [cartError, setCartError] = useState("");
  const [loading, setLoading] = useState(true);
  const [menuError, setMenuError] = useState("");

  useEffect(() => {
    let active = true;

    async function fetchMenu() {
      try {
        const snapshot = await getDb().collection("menu").get();
        const items = snapshot.docs.map((document) => {
          const data = document.data();
          const id = Number(data.id ?? document.id);

          return {
            id,
            name: String(data.name || ""),
            description: String(data.description || ""),
            price: Number(data.price) || 0,
            image: String(data.image || "logo.png"),
            category: normalizeCategory(data.category),
          };
        });

        // Sort by numeric product ID so the display order matches your original menu.
        items.sort((a, b) => a.id - b.id);

        if (active) setProducts(items);
      } catch (error) {
        console.error("Unable to fetch Firestore menu:", error);
        if (active) setMenuError("Unable to load the menu. Please try again later.");
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchMenu();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const search = query.toLowerCase().trim();
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(search) ||
        product.description.toLowerCase().includes(search),
    );
  }, [products, query]);

  const by = (category) => filtered.filter((product) => product.category === category);

  const add = (product) => {
    try {
      addToCart({
        product_id: product.id,
        name: product.name,
        price: product.price,
        image: `/images/${product.image}`,
      });
      setCartError("");
      setAdded((old) => ({ ...old, [product.id]: true }));
      window.setTimeout(
        () => setAdded((old) => ({ ...old, [product.id]: false })),
        1400,
      );
    } catch (error) {
      setCartError(error.message || "Unable to add this item. Please try again.");
    }
  };

  return (
    <>
      <Navbar />
      <section className="menu-header">
        <h1>Our Menu</h1>
        <p>{products.length} handcrafted food and drinks available</p>
      </section>

      <div className="search-box">
        <i className="fa-solid fa-magnifying-glass" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search menu..."
        />
      </div>

      <div className="menu-filter">
        <Link className={!query ? "active" : ""} to="/customer/menu">
          All
        </Link>
        {groups.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </div>

      {cartError && (
        <p className="cart-feedback error" role="alert">
          {cartError}
        </p>
      )}
      {loading && <p className="section-subtitle">Loading menu...</p>}
      {menuError && (
        <p className="cart-feedback error" role="alert">
          {menuError}
        </p>
      )}

      {!loading && !menuError &&
        groups.map(([id, label]) => (
          <section className="menu-section" id={id} key={id}>
            <h2>{label}</h2>
            <div className="menu-grid">
              {by(id).map((product) => (
                <div className="menu-card" key={product.id}>
                  <img
                    src={`/images/${product.image}`}
                    alt={product.name}
                    loading="lazy"
                  />
                  <div className="menu-info">
                    <h3>{product.name}</h3>
                    <p>{product.description}</p>
                    <div className="product-bottom">
                      <span>₱{product.price.toFixed(2)}</span>
                      <button
                        type="button"
                        className={`add-cart ${added[product.id] ? "is-added" : ""}`}
                        aria-live="polite"
                        onClick={() => add(product)}
                      >
                        {added[product.id] ? "✓ Added" : "Add to Cart"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!by(id).length && (
                <div className="empty-cart">
                  <h2>No matching products</h2>
                </div>
              )}
            </div>
          </section>
        ))}
      <Footer />
    </>
  );
}
