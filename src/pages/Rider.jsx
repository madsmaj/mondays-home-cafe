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
      return "You are visible to the admin and can accept one available pickup.";
    case "Busy":
      return "You have an active order. Your status will return to Online after you confirm the customer received it.";
    default:
      return "You are not accepting new pickups. You can go online whenever you are ready to work.";
  }
}

function formatStatusTime(value) {
  if (!value) return "Not available";
  const date = typeof value?.toDate === "function"
    ? value.toDate()
    : new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleString();
}

export default function Rider() {
  const rider = auth.getUserForRole("rider");
  const riderId = rider?.uid || rider?.id || "";

  const [orders, setOrders] = useState([]);
  const [riders, setRiders] = useState([]);
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

    const timer = window.setInterval(() => {
      if (!document.hidden) load();
    }, 12000);

    const refreshOnFocus = () => {
      if (!document.hidden) load();
    };

    document.addEventListener("visibilitychange", refreshOnFocus);
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshOnFocus);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [riderId]);

  const me = useMemo(
    () =>
      riders.find(
        (item) => String(item.id || "") === String(riderId),
      ) || null,
    [riders, riderId],
  );

  const availability = me?.availability || rider?.availability || "Offline";
  const statusUpdatedAt = me?.updatedAt || rider?.updatedAt;

  // Keep a pickup in this section after the rider accepts it. This lets the
  // Accept Pickup button change in-place to Mark as Delivered, as requested.
  const readyOrders = useMemo(
    () =>
      orders.filter((order) => {
        const unassignedReady =
          order.status === "Ready" && !order.rider_id;
        const acceptedByMe =
          order.status === "Accepted" &&
          String(order.rider_id || "") === String(riderId);
        return unassignedReady || acceptedByMe;
      }),
    [orders, riderId],
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
            ["Received", "Delivered"].includes(order.status),
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
      "Accept this pickup?\n\nThis order will be assigned to you and your status will change to BUSY. After the customer receives the order, tap “Mark as Delivered”. The admin will see the receipt confirmation, and the customer will see “Delivered”.",
    );

    if (!confirmed) return;

    try {
      setBusy(true);
      setError("");
      setMessage("");

      const result = await apiRequest("claim-order", {
        method: "POST",
        body: { order_id: orderId },
      });

      if (!result?.success) {
        throw new Error(result?.message || "The pickup was not assigned. Please try again.");
      }

      // Update this screen immediately after the Firestore transaction succeeds.
      // The customer and admin dashboards receive the same order update from Firestore.
      setOrders((previous) =>
        previous.map((order) =>
          order.id === orderId
            ? {
                ...order,
                status: "Accepted",
                rider_id: riderId,
                rider_name: rider.name || "You",
              }
            : order,
        ),
      );
      auth.saveStaff({
        ...rider,
        availability: "Busy",
        updatedAt: new Date().toISOString(),
      });

      setMessage(
        "Pickup accepted. You are now BUSY and this order is assigned to you. When you leave the cafe, tap “Start Delivery”.",
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
      true;

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
        "Receipt confirmed. The admin now sees the order as Received, the customer sees Delivered, and you are now Available.",
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
        {order.status === "Accepted"
          ? "📦 Pickup accepted — assigned to you"
          : "🛵 Out for delivery — customer is waiting"}
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
        {order.status === "Accepted" && (
          <>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Has the customer received this order?\n\nThe customer will see Delivered and the admin will see Received.",
                  )
                ) {
                  changeStatus(order.id, "Received");
                }
              }}
            >
              {busy ? "Updating…" : "Mark as Delivered ✓"}
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

        {/* Legacy assigned orders from the previous Delivery step */}
        {order.status === "Delivery" && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Has the customer received this order?\n\nThe customer will see Delivered and the admin will see Received.",
                )
              ) {
                changeStatus(order.id, "Received");
              }
            }}
          >
            {busy ? "Updating…" : "Mark as Delivered ✓"}
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
Accept a ready order, deliver it to the customer, and mark it delivered. The customer will confirm receipt, and your availability updates automatically.
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

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
              padding: 16,
              marginTop: 16,
              borderRadius: 14,
              background: availability === "Available"
                ? "rgba(22, 163, 74, 0.09)"
                : availability === "Busy"
                  ? "rgba(234, 88, 12, 0.09)"
                  : "rgba(107, 114, 128, 0.09)",
            }}
          >
            <div>
              <strong>
                {availability === "Available"
                  ? "You are accepting pickups"
                  : availability === "Busy"
                    ? "You are occupied with an order"
                    : "You are not accepting pickups"}
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                {availability === "Busy"
                  ? "Complete or release your current pickup to become available again."
                  : availability === "Available"
                    ? "Switch off when you need a break or are unavailable."
                    : "Switch on when you are ready to receive a pickup."}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={availability === "Available"}
              aria-label="Rider availability"
              className={availability === "Available" ? "btn btn-primary" : "btn btn-secondary"}
              disabled={busy || availability === "Busy"}
              onClick={() =>
                setAvailability(
                  availability === "Available" ? "Offline" : "Available",
                )
              }
              style={{
                minWidth: 170,
                minHeight: 48,
                opacity: busy || availability === "Busy" ? 0.7 : 1,
                cursor: busy || availability === "Busy" ? "not-allowed" : "pointer",
              }}
            >
              {busy
                ? "Updating status…"
                : availability === "Busy"
                  ? "🔒 Busy — Locked"
                  : availability === "Available"
                    ? "🟢 Online · Tap to go offline"
                    : "⚫ Offline · Tap to go online"}
            </button>
          </div>

          <p style={{ fontSize: 12, opacity: 0.75, marginTop: 10 }}>
            Last status update: {formatStatusTime(statusUpdatedAt)}
          </p>


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
            CURRENT PICKUP
        ====================================================== */}
        <h2 className="dashboard-title" id="current-pickup">🛵 My Current Pickup</h2>

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
                  ? "Your rider status is Busy. Use the current delivery section above to complete your active order."
                  : "Go Online when you are ready to accept a pickup."}
            </p>
          </div>
        )}

        {/* =====================================================
            READY PICKUPS
        ====================================================== */}
        <h2 className="dashboard-title">📦 Pickup Queue & Accepted Pickup</h2>

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
                    ? "Complete your current delivery before accepting another one."
                    : "Go Online to enable the Accept Pickup button."}
                </p>
              </div>
            )}

            {readyOrders.map((order) => (
              <div className="delivery-card" key={order.id}>
                <h2>{order.order_number || order.id}</h2>
                <div className="order-status">
                  {order.status === "Accepted"
                    ? "🟠 Pickup accepted — assigned to you (Busy)"
                    : "📦 Ready for Pickup"}
                </div>

                <h3>👤 Customer</h3>
                <p>{order.customer_name || "Customer"}</p>
                <p>📞 {order.phone || "No phone provided"}</p>
                <p>📍 {order.address || "No address provided"}</p>

                <h3>🛒 Items</h3>
                <Items items={order.items} />

                <h3>💰 Total</h3>
                <p>₱{money(order.total)}</p>

                <div className="delivery-actions">
                  {order.status === "Accepted" ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Have you handed this order to the customer?\n\nThis confirms the handover. The customer will see Delivered and the admin will see Received.",
                          )
                        ) {
                          changeStatus(order.id, "Received");
                        }
                      }}
                    >
                      {busy ? "Please wait…" : "Mark as Delivered ✓"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={canAccept ? "btn btn-primary" : "btn btn-secondary"}
                      disabled={busy || !canAccept}
                      onClick={() => {
                        if (canAccept) {
                          claim(order.id);
                        } else if (availability === "Offline") {
                          setAvailability("Available");
                        }
                      }}
                    >
                      {busy
                        ? "Please wait…"
                        : canAccept
                          ? "Accept Pickup 🛵"
                          : availability === "Busy"
                            ? "You are Busy with another pickup"
                            : "Go Online to Accept"}
                    </button>
                  )}
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
        <h2 className="dashboard-title">✅ Recently Received</h2>

        {myDeliveredOrders.length ? (
          myDeliveredOrders.map((order) => (
            <div className="delivery-card" key={order.id}>
              <h2>{order.order_number || order.id}</h2>
              <div className="order-status">✅ Received — Handover Confirmed</div>
              <p>You confirmed that the customer received this order.</p>
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
            <h2>No received orders yet</h2>
            <p>Orders you have confirmed as received will appear here.</p>
          </div>
        )}
      </section>
    </>
  );
}
