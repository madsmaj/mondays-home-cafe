import { useEffect, useMemo, useState } from "react";
import { Navbar } from "../components/Layout";
import { auth } from "../lib/auth";
import { apiRequest, money } from "../lib/api";

function Items({ items }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p>No item details available.</p>;
  }

  return (
    <>
      {items.map((item, index) => (
        <p key={`${item.product_id || item.product_name || "item"}-${index}`}>
          {item.product_name || "Product"} × {item.quantity || 1}
        </p>
      ))}
    </>
  );
}

function availabilityLabel(value) {
  switch (value) {
    case "Available":
      return "🟢 Online — Available";
    case "Busy":
      return "🔴 Busy — Delivery in progress";
    default:
      return "⚫ Offline — Not accepting pickups";
  }
}

function availabilityHelp(value) {
  switch (value) {
    case "Available":
      return "You are online and can accept a Ready pickup.";
    case "Busy":
      return "You already have an active pickup. Finish the delivery before going offline.";
    default:
      return "You are not accepting new pickups. Ready orders may still be visible, but you cannot accept them until you go online.";
  }
}

export default function Rider() {
  const rider = auth.getUserForRole("rider");
  const riderId = rider?.uid || rider?.id || "";

  const [orders, setOrders] = useState([]);
  const [riders, setRiders] = useState([]);
  const [showAvailability, setShowAvailability] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    if (!riderId) return;

    try {
      setError("");

      const [ordersResponse, ridersResponse] = await Promise.all([
        apiRequest("rider-orders"),
        apiRequest("rider-availability"),
      ]);

      const nextOrders = Array.isArray(ordersResponse.orders)
        ? ordersResponse.orders
        : [];
      const nextRiders = Array.isArray(ridersResponse.riders)
        ? ridersResponse.riders
        : [];

      setOrders(nextOrders);
      setRiders(nextRiders);

      // Always match the logged-in rider by the Firebase UID first.
      // rider_id is a separate human-readable ID such as RIDER-001.
      const me = nextRiders.find(
        (item) => String(item.id || "") === String(riderId),
      );

      if (me) {
        auth.saveStaff({
          ...rider,
          ...me,
          id: riderId,
          uid: riderId,
        });
      }
    } catch (err) {
      console.error("[RIDER] Refresh failed:", err);
      setError(err.message || "Unable to refresh rider data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!riderId) return undefined;

    load();

    const timer = window.setInterval(load, 8000);

    return () => window.clearInterval(timer);
  }, [riderId]);

  const me = useMemo(
    () =>
      riders.find(
        (item) => String(item.id || "") === String(riderId),
      ) || null,
    [riders, riderId],
  );

  const availability = me?.availability || rider?.availability || "Offline";

  const readyOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.status === "Ready" &&
          !order.rider_id,
      ),
    [orders],
  );

  const myActiveOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          String(order.rider_id || "") === String(riderId) &&
          ["Ready", "Delivery"].includes(order.status),
      ),
    [orders, riderId],
  );

  const myDeliveredOrders = useMemo(
    () =>
      orders
        .filter(
          (order) =>
            String(order.rider_id || "") === String(riderId) &&
            order.status === "Delivered",
        )
        .slice(0, 5),
    [orders, riderId],
  );

  const canAccept = availability === "Available";
  const isBusy = availability === "Busy";

  if (!rider) return null;

  const setAvailability = async (next) => {
    if (next === "Offline") {
      const confirmed = window.confirm(
        "Go offline?\n\nYou will stop accepting new pickups. You can go online again at any time.",
      );

      if (!confirmed) return;
    }

    try {
      setBusy(true);
      setError("");
      setMessage("");

      const result = await apiRequest("set-rider-availability", {
        method: "POST",
        body: { availability: next },
      });

      setMessage(
        next === "Available"
          ? "You are now online and ready to accept pickups."
          : "You are now offline and will not accept new pickups.",
      );

      if (result?.availability) {
        auth.saveStaff({
          ...rider,
          availability: result.availability,
        });
      }

      await load();
    } catch (err) {
      console.error("[RIDER] Availability update failed:", err);
      setError(err.message || "Unable to change your rider status.");
    } finally {
      setBusy(false);
    }
  };

  const claim = async (orderId) => {
    if (!canAccept) {
      setError("Go Online before accepting a pickup.");
      return;
    }

    const confirmed = window.confirm(
      "Accept this pickup?\n\nYou will become Busy until you release this pickup or mark it Delivered.",
    );

    if (!confirmed) return;

    try {
      setBusy(true);
      setError("");
      setMessage("");

      await apiRequest("claim-order", {
        method: "POST",
        body: { order_id: orderId },
      });

      setMessage(
        "Pickup accepted. You are now Busy with this order.",
      );

      await load();
    } catch (err) {
      console.error("[RIDER] Claim failed:", err);
      setError(err.message || "Unable to accept this pickup.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const release = async (orderId) => {
    const confirmed = window.confirm(
      "Release this pickup?\n\nThe order will return to the available pickup list and another online rider can accept it.",
    );

    if (!confirmed) return;

    try {
      setBusy(true);
      setError("");
      setMessage("");

      await apiRequest("release-order", {
        method: "POST",
        body: { order_id: orderId },
      });

      setMessage(
        "Pickup released. You are online and available again.",
      );

      await load();
    } catch (err) {
      console.error("[RIDER] Release failed:", err);
      setError(err.message || "Unable to release this pickup.");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (orderId, status) => {
    const confirmed =
      status !== "Delivery" ||
      window.confirm(
        "Start delivery for this pickup?\n\nYour status will remain Busy until the order is delivered.",
      );

    if (!confirmed) return;

    try {
      setBusy(true);
      setError("");
      setMessage("");

      await apiRequest("update-order-status", {
        method: "POST",
        body: {
          order_id: orderId,
          status,
        },
      });

      setMessage(
        status === "Delivery"
          ? "Delivery started. Stay Busy until the order is delivered."
          : "Order marked as Delivered. You are now Available.",
      );

      await load();
    } catch (err) {
      console.error("[RIDER] Order status update failed:", err);
      setError(err.message || "Unable to update the order.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const DeliveryCard = ({ order }) => (
    <div className="delivery-card">
      <h2>{order.order_number || order.id}</h2>
      <div className="order-status">
        {order.status === "Ready"
          ? "📦 Ready — Your Pickup"
          : "🛵 Out for Delivery"}
      </div>

      <p>
        <strong>Assigned rider:</strong>{" "}
        {order.rider_name || rider.name || "You"}
      </p>

      <h3>👤 Customer</h3>
      <p>{order.customer_name || "Customer"}</p>
      <p>📞 {order.phone || "No phone provided"}</p>
      <p>📍 {order.address || "No address provided"}</p>

      <h3>🛒 Items</h3>
      <Items items={order.items} />

      <h3>💰 Total</h3>
      <p>₱{money(order.total)}</p>

      <div className="delivery-actions">
        {order.status === "Ready" && (
          <>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => changeStatus(order.id, "Delivery")}
            >
              Start Delivery 🛵
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => release(order.id)}
            >
              Release Pickup ↩️
            </button>
          </>
        )}

        {order.status === "Delivery" && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Confirm that this order has been delivered to the customer?",
                )
              ) {
                changeStatus(order.id, "Delivered");
              }
            }}
          >
            Mark Delivered 📍
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Navbar simple showLogout />

      <section className="section">
        <h1 className="section-title">🛵 Rider Dashboard</h1>
        <p className="section-subtitle">
          Accept pickups, deliver orders, and manage your online status.
        </p>

        {/* =====================================================
            RIDER STATUS
        ====================================================== */}
        <div
          className="delivery-card"
          style={{
            border: "2px solid rgba(107, 62, 38, 0.15)",
            marginBottom: 25,
          }}
        >
          <h2>👋 Hello, {rider.name || rider.email || "Rider"}</h2>

          <p>
            <strong>Rider ID:</strong>{" "}
            {rider.user_code || rider.rider_id || rider.id}
          </p>

          <div
            className="order-status"
            style={{ fontSize: 18, marginBottom: 10 }}
          >
            {availabilityLabel(availability)}
          </div>

          <p>{availabilityHelp(availability)}</p>

          {availability === "Offline" && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => setAvailability("Available")}
            >
              🟢 Go Online
            </button>
          )}

          {availability === "Available" && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => setAvailability("Offline")}
            >
              ⚫ Go Offline
            </button>
          )}

          {availability === "Busy" && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled
              title="Finish or release your current pickup first."
            >
              🔴 Busy — Finish Current Pickup
            </button>
          )}

          {message && (
            <p
              role="status"
              style={{
                marginTop: 15,
                fontWeight: 600,
              }}
            >
              {message}
            </p>
          )}
        </div>

        {error && (
          <div
            className="empty-cart"
            role="alert"
            style={{ marginBottom: 20 }}
          >
            <h3>⚠️ Something needs attention</h3>
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={load}
              disabled={busy}
            >
              Refresh Dashboard
            </button>
          </div>
        )}

        {/* =====================================================
            RIDER AVAILABILITY
        ====================================================== */}
        <div className="delivery-actions" style={{ marginTop: 20 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowAvailability((value) => !value)}
          >
            {showAvailability
              ? "Hide Rider Availability"
              : "View Rider Availability"}{" "}
            👥
          </button>
        </div>

        {showAvailability && (
          <div id="rider-availability" style={{ marginTop: 20 }}>
            <div className="category-cards">
              {riders.map((otherRider) => (
                <div
                  className="category-card"
                  key={otherRider.id || otherRider.rider_id}
                >
                  <h3>🛵 {otherRider.name || "Rider"}</h3>
                  <p>
                    <strong>
                      {otherRider.user_code || otherRider.rider_id || "—"}
                    </strong>
                  </p>
                  <p>{availabilityLabel(otherRider.availability)}</p>

                  {otherRider.current_order_number ? (
                    <>
                      <p>Order: {otherRider.current_order_number}</p>
                      <p>{otherRider.current_order_status || ""}</p>
                    </>
                  ) : (
                    <p>
                      {otherRider.availability === "Available"
                        ? "Ready to accept a pickup."
                        : otherRider.availability === "Busy"
                          ? "Currently delivering."
                          : "Not accepting pickups."}
                    </p>
                  )}
                </div>
              ))}

              {!riders.length && (
                <div className="empty-cart">
                  <p>No rider availability information is available.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =====================================================
            CURRENT PICKUP
        ====================================================== */}
        <h2 className="dashboard-title">🛵 My Current Pickup</h2>

        {loading ? (
          <div className="empty-cart">
            <h2>Loading dashboard…</h2>
          </div>
        ) : myActiveOrders.length ? (
          myActiveOrders.map((order) => (
            <DeliveryCard key={order.id} order={order} />
          ))
        ) : (
          <div className="empty-cart">
            <h2>No active pickup</h2>
            <p>
              {canAccept
                ? "You are online and ready to accept a pickup."
                : isBusy
                  ? "Your rider status is Busy. Refresh the dashboard if your current pickup is not shown."
                  : "Go Online when you are ready to accept a pickup."}
            </p>
          </div>
        )}

        {/* =====================================================
            READY PICKUPS
        ====================================================== */}
        <h2 className="dashboard-title">📦 Ready for Pickup</h2>

        {loading ? (
          <div className="empty-cart">
            <h2>Loading pickups…</h2>
          </div>
        ) : readyOrders.length ? (
          <>
            {!canAccept && (
              <div
                className="delivery-card"
                style={{ marginBottom: 20 }}
              >
                <h3>
                  {availability === "Busy"
                    ? "🔴 You are currently Busy"
                    : "⚫ You are Offline"}
                </h3>
                <p>
                  {availability === "Busy"
                    ? "Finish your current pickup before accepting another one."
                    : "Go Online to enable the Accept Pickup button."}
                </p>
              </div>
            )}

            {readyOrders.map((order) => (
              <div className="delivery-card" key={order.id}>
                <h2>{order.order_number || order.id}</h2>
                <div className="order-status">📦 Ready for Pickup</div>

                <h3>👤 Customer</h3>
                <p>{order.customer_name || "Customer"}</p>
                <p>📞 {order.phone || "No phone provided"}</p>
                <p>📍 {order.address || "No address provided"}</p>

                <h3>🛒 Items</h3>
                <Items items={order.items} />

                <h3>💰 Total</h3>
                <p>₱{money(order.total)}</p>

                <div className="delivery-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canAccept || busy}
                    onClick={() => claim(order.id)}
                  >
                    {canAccept
                      ? "Accept Pickup 🛵"
                      : availability === "Busy"
                        ? "Busy — Finish Current Pickup"
                        : "Go Online to Accept"}
                  </button>
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="empty-cart">
            <h2>No unassigned ready pickups 📦</h2>
            <p>
              New orders will appear here after the admin marks them Ready.
            </p>
          </div>
        )}

        {/* =====================================================
            RECENTLY DELIVERED
        ====================================================== */}
        <h2 className="dashboard-title">✅ Recently Delivered</h2>

        {myDeliveredOrders.length ? (
          myDeliveredOrders.map((order) => (
            <div className="delivery-card" key={order.id}>
              <h2>{order.order_number || order.id}</h2>
              <div className="order-status">✅ Delivered</div>
              <p>
                <strong>Customer:</strong>{" "}
                {order.customer_name || "Customer"}
              </p>
              <p>
                <strong>Total:</strong> ₱{money(order.total)}
              </p>
            </div>
          ))
        ) : (
          <div className="empty-cart">
            <h2>No completed deliveries yet</h2>
            <p>Your delivered pickups will appear here.</p>
          </div>
        )}
      </section>
    </>
  );
}
