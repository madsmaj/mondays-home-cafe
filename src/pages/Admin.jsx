import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Navbar } from "../components/Layout";
import { auth } from "../lib/auth";
import { apiRequest, money } from "../lib/api";
function OrderCard({ o, onStatus, onPayment, busy }) {
  const items = o.items || [];
  return (
    <div className="order-card">
      <h2>Order #{o.order_number || o.id}</h2>
      <div className="order-status">{({
        Pending: "📋 New order — awaiting review",
        Preparing: "☕ Accepted — being prepared",
        Ready: "📦 Ready — waiting for rider",
        Accepted: "📦 Rider accepted — pickup assigned (rider is Busy)",
        Delivery: "🛵 On the way",
        Delivered: "✅ Received — legacy delivery confirmation",
        Received: "✅ Received — rider confirmed handover",
        Completed: "✅ Received",
        Rejected: "❌ Declined",
        Cancelled: "🚫 Cancelled",
      })[o.status] || o.status}</div>
      <p>📅 {o.created_at || "-"}</p>
      <h3>👤 Customer</h3>
      <p>{o.customer_name}</p>
      <p>📧 {o.customer_email || o.email || "-"}</p>
      <p>📞 {o.phone}</p>
      <p>📍 {o.address}</p>
      {o.notes && <p>📝 {o.notes}</p>}
      <h3>🛒 Items</h3>
      {items.map((i) => (
        <p key={i.product_id || i.product_name}>
          {i.product_name || "Product"} × {i.quantity}
        </p>
      ))}
      <h3>💰 Total</h3>
      <p>₱{money(o.total)}</p>
      <h3>💳 Payment</h3>
      <p>
        {o.payment_method || "Not selected"} —{" "}
        <strong>{o.payment_status || "Pending"}</strong>
      </p>
      {o.payment_reference && <p>Reference: {o.payment_reference}</p>}
      {o.rider_id && <p>🛵 Assigned rider: <strong>{o.rider_name || "Assigned"}</strong></p>}
      {o.status === "Rejected" && <p role="status"><strong>Reason:</strong> {o.rejectionReason || "The cafe could not accept this order."}</p>}
      {o.status === "Accepted" && <p role="status">A rider accepted this order. The customer now sees “On the way”. Rider status: Busy.</p>}
      {o.status === "Delivery" && <p role="status">The rider is on the way to the customer.</p>}
      {["Received", "Delivered", "Completed"].includes(o.status) && <p role="status">The rider confirmed that the order was handed to and received by the customer.</p>}
      <div className="admin-actions">
        {o.status === "Pending" && (
          <>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => onStatus(o.id, "Preparing")}
            >
              Accept &amp; Prepare ☕
            </button>
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => onStatus(o.id, "Rejected")}
            >
              Reject ❌
            </button>
          </>
        )}
        {o.status === "Preparing" && (
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => onStatus(o.id, "Ready")}
          >
            Ready For Pickup 📦
          </button>
        )}
        {o.status === "Ready" && (
          <p><strong>Waiting for an online rider to accept this order.</strong></p>
        )}
        {o.status === "Accepted" && (
          <p><strong>Rider accepted the order. Customer status: On the way. Rider status: Busy.</strong></p>
        )}
        {o.status === "Delivery" && (
          <p><strong>Rider is on the way. Rider status: Busy.</strong></p>
        )}
        {["Received", "Delivered", "Completed"].includes(o.status) && (
          <p><strong>Received: the rider confirmed the customer has the order.</strong></p>
        )}
        {!["Cash on Delivery", "Paid", "Rejected"].includes(o.payment_method) &&
          o.payment_status !== "Paid" &&
          o.status !== "Rejected" && (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => onPayment(o.id)}
            >
              Mark Payment Paid 💳
            </button>
          )}
      </div>
    </div>
  );
}
export default function Admin() {
  const user = auth.getUserForRole("admin");
  const [orders, setOrders] = useState([]);
  const [riders, setRiders] = useState([]);
  const [filter, setFilter] = useState("All");
  const [busyOrder, setBusyOrder] = useState("");
  const load = async () => {
    if (!user?.id) return;
    try {
      const [orderData, riderData] = await Promise.all([
        apiRequest(`get-orders?admin_id=${user.id}`),
        apiRequest("rider-availability"),
      ]);
      setOrders(orderData.orders || []);
      setRiders(riderData.riders || []);
    } catch (e) {
      console.error("Unable to load admin dashboard:", e);
    }
  };
  useEffect(() => {
    if (!user?.id) return;
    load();
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, 12000);
    const refreshOnFocus = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", refreshOnFocus);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refreshOnFocus);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [user?.id]);
  if (!user) return null;
  const activeOrders = orders.filter(
    (o) => !["Completed", "Rejected", "Cancelled"].includes(o.status),
  );
  const active = filter === "All"
    ? activeOrders
    : activeOrders.filter((order) =>
        filter === "Received"
          ? ["Received", "Delivered", "Completed"].includes(order.status)
          : order.status === filter,
      );
  const update = async (id, status) => {
    let reason = "";
    if (status === "Rejected") {
      if (!confirm("Reject this order? The customer will be notified.")) return;
      reason = window.prompt("Optional: explain why this order is rejected.", "The cafe is unable to fulfill this order.");
      if (reason === null) return;
      reason = reason.trim() || "The cafe is unable to fulfill this order.";
    }
    try {
      setBusyOrder(id);
      await apiRequest("update-order-status", {
        method: "POST",
        body: {
          order_id: id,
          status,
          changed_by: user.id,
          changed_role: "admin",
          reason,
        },
      });
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyOrder("");
    }
  };
  const pay = async (id) => {
    if (!confirm("Mark this payment as PAID?")) return;
    try {
      setBusyOrder(id);
      await apiRequest("update-payment", {
        method: "POST",
        body: { order_id: id, status: "Paid", changed_by: user.id },
      });
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyOrder("");
    }
  };
  const count = (s) => orders.filter((o) => o.status === s).length;
  return (
    <>
      <Navbar simple />
      <section className="section">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 15,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 className="section-title" style={{ textAlign: "left" }}>
              ☕ Monday's Admin Dashboard
            </h1>
            <p className="section-subtitle" style={{ textAlign: "left" }}>
              Manage customer orders
            </p>
          </div>
          <div>
            <Link className="btn btn-primary" to="/admin/history">
              📊 Order History
            </Link>{" "}
            <button
              className="btn btn-secondary"
              onClick={() => {
                auth.clear();
                location.href = "/admin/login";
              }}
            >
              Logout 🚪
            </button>
          </div>
        </div>
        <section id="admin-riders" style={{ margin: "24px 0" }}>
          <h2 className="dashboard-title">🛵 Rider Availability</h2>
          <div className="category-cards">
            {riders.map((rider) => {
              const status = rider.availability || "Offline";
              const label = status === "Available" ? "Online — Available" : status === "Busy" ? "Busy — Delivering" : "Offline";
              return (
                <div className="category-card" key={rider.id}>
                  <h3>{rider.name || "Rider"}</h3>
                  <p>{rider.email || "No email"}</p>
                  <p><strong>{rider.rider_id || rider.user_code || rider.id}</strong></p>
                  <p aria-label={`Rider status: ${label}`}>{status === "Available" ? "🟢" : status === "Busy" ? "🟠" : "⚫"} {label}</p>
                  {rider.updatedAt && (
                    <p style={{ fontSize: 12, opacity: 0.7 }}>
                      Updated: {typeof rider.updatedAt?.toDate === "function"
                        ? rider.updatedAt.toDate().toLocaleString()
                        : new Date(rider.updatedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              );
            })}
            {!riders.length && <div className="empty-cart"><p>No rider accounts found.</p></div>}
          </div>
        </section>
        <div className="admin-order-toolbar" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "28px 0 16px" }}>
          {["All", "Pending", "Preparing", "Ready", "Accepted", "Received"].map((status) => (
            <button
              key={status}
              type="button"
              className={filter === status ? "btn btn-primary" : "btn btn-secondary"}
              aria-pressed={filter === status}
              onClick={() => setFilter(status)}
            >
              {status === "All" ? `All Active (${activeOrders.length})` : `${status} (${status === "Received" ? orders.filter((o) => ["Received", "Delivered", "Completed"].includes(o.status)).length : count(status)})`}
            </button>
          ))}
        </div>
        <div id="admin-orders">
          {active.length ? (
            active.map((o) => (
              <OrderCard key={o.id} o={o} onStatus={update} onPayment={pay} busy={busyOrder === o.id} />
            ))
          ) : (
            <div className="empty-cart">
              <h2>{filter === "All" ? "No active orders ☕" : `No ${filter.toLowerCase()} orders`}</h2>
              <p>{filter === "All" ? "New customer orders will appear here." : "Choose another status to see more orders."}</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
function Stat({ t, v }) {
  return (
    <div className="category-card">
      <h3>{t}</h3>
      <h2>{v}</h2>
    </div>
  );
}
export function AdminHistory() {
  const user = auth.getUserForRole("admin");
  const [orders, setOrders] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("All");
  useEffect(() => {
    if (!user?.id) return;
    apiRequest(`get-orders?admin_id=${user.id}`)
      .then((d) => setOrders(d.orders || []))
      .catch((e) => console.error("Unable to load order history:", e));
  }, [user?.id]);
  if (!user) return null;
  const list = orders.filter(
    (o) =>
      (filter === "All" || o.status === filter) &&
      `${o.customer_name || ""} ${o.order_number || o.id}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const sales = orders
    .filter((o) => ["Received", "Delivered", "Completed"].includes(o.status))
    .reduce((s, o) => s + Number(o.total || 0), 0);
  return (
    <>
      <Navbar simple />
      <section className="section">
        <div className="nav-icons" style={{ justifyContent: "flex-end" }}>
          <Link className="btn btn-primary" to="/admin">
            Dashboard
          </Link>
          <button
            className="btn btn-secondary"
            onClick={() => {
              auth.clear();
              location.href = "/admin/login";
            }}
          >
            Logout 🚪
          </button>
        </div>
        <h1 className="section-title">📚 Order History</h1>
        <p className="section-subtitle">Track all customer orders and sales</p>
        <div className="category-cards">
          <Stat t="📦 Total Orders" v={orders.length} />
          <Stat
            t="👥 Customers"
            v={new Set(orders.map((o) => o.customer_id).filter(Boolean)).size}
          />
          <Stat
            t="✅ Received"
            v={orders.filter((o) => ["Received", "Delivered", "Completed"].includes(o.status)).length}
          />
          <Stat t="💰 Sales" v={`₱${sales.toFixed(2)}`} />
        </div>
        <input
          className="search-box"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search customer or order number"
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option>All</option>
          {[
            "Completed",
            "Rejected",
            "Pending",
            "Preparing",
            "Ready",
            "Received",
            "Cancelled",
            "New Order",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <div>
          {list.length ? (
            list.map((o) => (
              <div className="order-card" key={o.id}>
                <h2>Order #{o.order_number || o.id}</h2>
                <div className="order-status">{o.status}</div>
                <p>
                  {o.customer_name} • ₱{money(o.total)}
                </p>
                <p>
                  📅 {o.completed_date || o.updated_at || o.created_at || "-"}
                </p>
                <Link
                  className="btn btn-secondary"
                  to={`/customer/receipt?order_id=${o.id}`}
                >
                  View Receipt 🧾
                </Link>
              </div>
            ))
          ) : (
            <div className="empty-cart">
              <h2>No matching orders</h2>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
