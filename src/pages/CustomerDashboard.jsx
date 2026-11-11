import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Navbar } from "../components/Layout";
import { useAuth } from "../lib/auth";
import { apiRequest, money } from "../lib/api";
import { getDb } from "../lib/firebase";

const statusInfo = {
  Pending: { label: "Order placed — awaiting cafe approval", icon: "📋", detail: "The cafe has received your order and will review it shortly." },
  Preparing: { label: "Accepted — being prepared", icon: "☕", detail: "The cafe accepted your order and is preparing it." },
  Ready: { label: "Ready — waiting for a rider", icon: "📦", detail: "Your order is ready. We are waiting for a rider to accept delivery." },
  Accepted: { label: "On the way", icon: "🛵", detail: "A rider has accepted your order and is on the way to your address." },
  Delivery: { label: "On the way", icon: "🛵", detail: "Your rider is on the way to your address." },
  Received: { label: "Delivered", icon: "✅", detail: "Your order has been handed over successfully." },
  Delivered: { label: "Delivered", icon: "✅", detail: "Your order has been handed over successfully." },
  Completed: { label: "Delivered", icon: "✅", detail: "Your order has been handed over successfully." },
  Rejected: { label: "Order declined", icon: "❌", detail: "The cafe could not accept this order." },
  Cancelled: { label: "Order cancelled", icon: "🚫", detail: "This order was cancelled." },
};

const flow = ["Pending", "Preparing", "Ready", "Accepted", "Delivered"];

const flowNames = ["Placed", "Preparing", "Ready", "On the way", "Delivered"];

function formatDate(value) {
  if (!value) return "—";
  if (typeof value?.toDate === "function") return value.toDate().toLocaleString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function OrderProgress({ status }) {
  if (["Rejected", "Cancelled"].includes(status)) return null;
  const normalizedStatus = ["Delivery"].includes(status) ? "Accepted"
    : ["Received", "Delivered", "Completed"].includes(status) ? "Delivered"
    : status;
  const current = flow.indexOf(normalizedStatus);
  return (
    <ol aria-label="Order progress" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))", gap: 8, listStyle: "none", padding: 0, margin: "16px 0" }}>
      {flow.map((step, index) => {
        const done = current >= index;
        const active = current === index;
        const names = flowNames;
        return (
          <li key={step} style={{ borderRadius: 10, padding: "9px 7px", textAlign: "center", fontSize: 12, background: done ? "rgba(22,163,74,.10)" : "rgba(120,120,120,.08)", border: active ? "2px solid #b96b32" : "1px solid transparent", fontWeight: active ? 700 : 500 }}>
            <div>{done ? "✓" : "○"}</div>
            {names[index]}
          </li>
        );
      })}
    </ol>
  );
}

export default function CustomerDashboard() {
  const { user } = useAuth();
  const customer = user?.role === "customer" ? user : null;
  const [orders, setOrders] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!customer?.uid) return undefined;
    let active = true;
    const unsubscribe = getDb()
      .collection("orders")
      .where("customer_id", "==", customer.uid)
      .onSnapshot(
        (snapshot) => {
          if (!active) return;
          const next = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          next.sort((a, b) => {
            const aTime = a.createdAt?.toMillis?.() || 0;
            const bTime = b.createdAt?.toMillis?.() || 0;
            return bTime - aTime;
          });
          setOrders(next);
          setLoadError("");
        },
        (error) => {
          console.error("[CUSTOMER ORDERS] Live subscription failed:", error);
          if (active) setLoadError("We couldn't load your orders. Please check your connection or ask the administrator to check Firestore permissions.");
        },
      );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [customer?.uid]);

  if (!customer) return null;

  const activeOrders = orders.filter((order) => ["Pending", "Preparing", "Ready", "Accepted", "Delivery"].includes(order.status));


  async function cancelOrder(order) {
    if (!window.confirm("Cancel this order? You can only cancel before the cafe starts preparing it.")) return;
    setActionBusy(order.id);
    try {
      await apiRequest("cancel-order", { method: "POST", body: { order_id: order.id } });
      setNotice("Your order has been cancelled.");
    } catch (error) {
      setLoadError(error.message || "Unable to cancel this order.");
    } finally {
      setActionBusy("");
    }
  }

  function OrderCard({ order }) {
    const info = statusInfo[order.status] || { label: order.status || "Status unavailable", icon: "ℹ️", detail: "Check back for the latest order update." };
    return (
      <article className="order-card" key={order.id}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={{ marginBottom: 6 }}>Order #{order.order_number || order.id}</h2>
          <span className="order-status">{info.icon} {info.label}</span>
        </div>
        <p style={{ marginTop: 6 }}>{info.detail}</p>
        {order.status === "Rejected" && order.rejectionReason && (
          <p style={{ padding: 12, borderRadius: 10, background: "rgba(185, 60, 60, .08)" }}>
            <strong>Admin's note:</strong> {order.rejectionReason}
          </p>
        )}
        <OrderProgress status={order.status} />
        <p>📅 Placed: {formatDate(order.createdAt || order.created_at)}</p>
        <h3>🛒 Items</h3>
        {(order.items || []).map((item, index) => (
          <p key={item.product_id || `${item.product_name}-${index}`}>{item.product_name || item.name || "Product"} × {item.quantity}</p>
        ))}
        <h3>💰 Total</h3>
        <p>₱{money(order.total)}</p>
        <p>💳 {order.payment_method || "Cash on Delivery"} — {order.payment_status || "Pending payment"}</p>
        {order.rider_id && (
          <div style={{ margin: "12px 0", padding: 12, borderRadius: 10, background: "rgba(185,107,50,.08)" }}>
            <strong>🛵 Your rider</strong>
            <p>{order.rider_name || "A rider has accepted your order."}</p>
          </div>
        )}
        <div className="order-actions">
          <Link className="btn btn-secondary" to={`/customer/receipt?order_id=${order.id}`}>View Receipt</Link>
          {order.status === "Pending" && (
            <button className="btn btn-secondary" disabled={actionBusy === order.id} onClick={() => cancelOrder(order)}>
              {actionBusy === order.id ? "Please wait…" : "Cancel Order"}
            </button>
          )}
          {["Received", "Delivered", "Completed"].includes(order.status) && (
            <strong role="status">✓ Delivered</strong>
          )}
        </div>
      </article>
    );
  }

  return (
    <>
      <Navbar />
      <section className="section">
        <h1 className="section-title">☕ My Orders</h1>
        <p className="section-subtitle">Hello, {customer.name || "there"}. Follow every step from order placement to delivery confirmation.</p>
        {loadError && <div className="empty-cart" role="alert"><p>{loadError}</p></div>}
        {notice && <div className="empty-cart" role="status"><p>{notice}</p></div>}
        <h2 className="dashboard-title">📦 In Progress</h2>
        {activeOrders.length ? activeOrders.map((order) => <OrderCard key={order.id} order={order} />) : (
          <div className="empty-cart"><h2>No active orders</h2><p>Your new orders will appear here as soon as you place them.</p><Link to="/customer/menu" className="btn btn-primary">Browse Menu</Link></div>
        )}
        <h2 className="dashboard-title">📚 Previous Orders</h2>
        {orders.filter((order) => ["Received", "Delivered", "Completed", "Rejected", "Cancelled"].includes(order.status)).length ? (
          orders.filter((order) => ["Received", "Delivered", "Completed", "Rejected", "Cancelled"].includes(order.status)).map((order) => <OrderCard key={order.id} order={order} />)
        ) : <div className="empty-cart"><p>Your completed and cancelled orders will be saved here.</p></div>}
      </section>
    </>
  );
}
