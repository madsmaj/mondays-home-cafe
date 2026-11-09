
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

// Normalize Firestore categories
function normalizeCategory(category) {
  const value = String(category || "").toLowerCase().trim();

  if (value === "rice" || value === "rice & sandwiches") {
    return "rice";
  }

  if (value === "specialty" || value === "specialty drinks") {
    return "specialty";
  }

  if (value === "coffee" || value === "coffee & drinks") {
    return "coffee";
  }

  return value;
}

// Get the correct image path for each product
function getProductImage(product) {
  const name = String(product.name || "").toLowerCase().trim();

  // Dalgona Coffee
  if (name.includes("dalgona")) {
    return "/images/coffee7.jpg";
  }

  // Iced Americano
  if (name.includes("iced americano")) {
    return "/images/coffee3.jpg";
  }

  // Other products use their Firestore image
  const image = String(product.image || "logo.png").trim();

  // Firebase Storage or external image URL
  if (image.startsWith("http://") || image.startsWith("https://")) {
    return image;
  }

  // Image path already starts with /
  if (image.startsWith("/")) {
    return image;
  }

  // Image path already includes images/
  if (image.startsWith("images/")) {
    return `/${image}`;
  }

  // Only filename is stored
  return `/images/${image}`;
}

export default function Menu() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState({});
  const [cartError, setCartError] = useState("");
  const [loading, setLoading] = useState(true);
  const [menuError, setMenuError] = useState("");

  // Fetch menu from Firestore
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

        // Sort products by numeric ID
        items.sort((a, b) => a.id - b.id);

        if (active) {
          setProducts(items);
        }
      } catch (error) {
        console.error("Unable to fetch Firestore menu:", error);

        if (active) {
          setMenuError(
            "Unable to load the menu. Please try again later."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchMenu();

    return () => {
      active = false;
    };
  }, []);

  // Search products
  const filtered = useMemo(() => {
    const search = query.toLowerCase().trim();

    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(search) ||
        product.description.toLowerCase().includes(search)
    );
  }, [products, query]);

  // Filter products by category
  const by = (category) =>
    filtered.filter((product) => product.category === category);

  // Add product to cart
  const add = (product) => {
    try {
      addToCart({
        product_id: product.id,
        name: product.name,
        price: product.price,
        image: getProductImage(product),
      });

      setCartError("");

      setAdded((old) => ({
        ...old,
        [product.id]: true,
      }));

      window.setTimeout(() => {
        setAdded((old) => ({
          ...old,
          [product.id]: false,
        }));
      }, 1400);
    } catch (error) {
      setCartError(
        error.message || "Unable to add this item. Please try again."
      );
    }
  };

  return (
    <>
      <Navbar />

      <section className="menu-header">
        <h1>Our Menu</h1>
        <p>
          {products.length} handcrafted food and drinks available
        </p>
      </section>

      {/* Search Menu */}
      <div className="search-box">
        <i className="fa-solid fa-magnifying-glass" />

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search menu..."
        />
      </div>

      {/* Category Filter */}
      <div className="menu-filter">
        <Link
          className={!query ? "active" : ""}
          to="/customer/menu"
        >
          All
        </Link>

        {groups.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </div>

      {/* Cart Error */}
      {cartError && (
        <p className="cart-feedback error" role="alert">
          {cartError}
        </p>
      )}

      {/* Loading */}
      {loading && (
        <p className="section-subtitle">
          Loading menu...
        </p>
      )}

      {/* Menu Error */}
      {menuError && (
        <p className="cart-feedback error" role="alert">
          {menuError}
        </p>
      )}

      {/* Menu Categories */}
      {!loading &&
        !menuError &&
        groups.map(([id, label]) => {
          const categoryProducts = by(id);

          return (
            <section
              className="menu-section"
              id={id}
              key={id}
            >
              <h2>{label}</h2>

              <div className="menu-grid">
                {categoryProducts.map((product) => (
                  <div
                    className="menu-card"
                    key={product.id}
                  >
                    {/* Product Image */}
                    <img
                      src={getProductImage(product)}
                      alt={product.name}
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = "/images/logo.png";
                      }}
                    />

                    {/* Product Information */}
                    <div className="menu-info">
                      <h3>{product.name}</h3>

                      <p>{product.description}</p>

                      <div className="product-bottom">
                        <span>
                          ₱{product.price.toFixed(2)}
                        </span>

                        {/* Add to Cart */}
                        <button
                          type="button"
                          className={`add-cart ${
                            added[product.id] ? "is-added" : ""
                          }`}
                          aria-live="polite"
                          onClick={() => add(product)}
                        >
                          {added[product.id]
                            ? "✓ Added"
                            : "Add to Cart"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {categoryProducts.length === 0 && (
                  <div className="empty-cart">
                    <h2>No matching products</h2>
                  </div>
                )}
              </div>
            </section>
          );
        })}

      <Footer />
    </>
  );
}
