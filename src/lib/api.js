import { getDb, serverTimestamp } from './firebase';
import { auth } from './auth';

export const money = value => Number(value || 0).toFixed(2);
export const escapeText = value => String(value ?? '');

const db = () => getDb();

function toDateString(value) {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function serialize(id, data) {
  return {
    id,
    ...data,
    created_at: toDateString(data.createdAt || data.created_at),
    updated_at: toDateString(data.updatedAt || data.updated_at),
    completed_date: toDateString(data.completedAt || data.completed_date),
    customer_received_date: toDateString(data.customerReceivedAt || data.customer_received_date),
  };
}

async function profileFor(uid) {
  if (!uid) return null;
  const snapshot = await db().collection('users').doc(uid).get();
  return snapshot.exists ? serialize(snapshot.id, snapshot.data()) : null;
}

async function orderWithId(id) {
  const snapshot = await db().collection('orders').doc(id).get();
  if (!snapshot.exists) throw new Error('Order not found.');

  const order = serialize(snapshot.id, snapshot.data());

  if (order.rider_id) {
    const rider = await profileFor(order.rider_id);
    order.rider_name = rider?.name || order.rider_name || '';
  }

  return order;
}

async function ordersFromSnapshot(snapshot) {
  return Promise.all(snapshot.docs.map(document => orderWithId(document.id)));
}

async function allOrders() {
  const snapshot = await db().collection('orders').get();
  const orders = await ordersFromSnapshot(snapshot);
  return orders.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function nextOrderNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${stamp}-${random}`;
}

export async function apiRequest(path, options = {}) {
  const clean = String(path).replace(/^\/+/, '');
  const [endpoint, rawQuery] = clean.split('?', 2);
  const params = new URLSearchParams(rawQuery || '');
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : (options.body || {});
  const current = auth.getUser();

  switch (endpoint) {
    case 'profile': {
      const user = await profileFor(params.get('user_id') || current?.id);
      if (!user) throw new Error('Profile not found.');
      return { success: true, user };
    }

    case 'login':
    case 'register':
    case 'google-login':
      throw new Error('Authentication is handled directly by Firebase.');

    case 'customer-orders': {
      const uid = params.get('customer_id') || current?.id;
      if (!uid || current?.role !== 'customer' || current.id !== uid) {
        throw new Error('Customer access required.');
      }

      const snapshot = await db().collection('orders').where('customer_id', '==', uid).get();
      const orders = await ordersFromSnapshot(snapshot);
      orders.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return { success: true, orders };
    }

    case 'order-details': {
      const order = await orderWithId(params.get('order_id'));
      if (current?.role === 'customer' && order.customer_id !== current.id) {
        throw new Error('You do not have access to this receipt.');
      }
      if (!['customer', 'admin'].includes(current?.role)) {
        throw new Error('Customer or admin access required.');
      }
      return { success: true, order };
    }

    case 'create-order': {
      if (!current?.id || current.role !== 'customer') {
        throw new Error('Please log in as a customer before placing an order.');
      }

      const profile = await profileFor(current.id);
      const items = Array.isArray(body.items)
        ? body.items.map(item => ({
            product_id: String(item.product_id),
            product_name: item.name || item.product_name || 'Product',
            quantity: Math.max(1, Number(item.quantity) || 1),
            price: Number(item.price) || 0,
          }))
        : [];

      if (!items.length) throw new Error('Your cart is empty.');

      const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const orderNumber = nextOrderNumber();

      const reference = await db().collection('orders').add({
        order_number: orderNumber,
        customer_id: current.id,
        customer_email: body.customer_email || profile?.email || current.email || '',
        customer_name: body.customer_name || profile?.name || current.name || '',
        phone: body.phone || profile?.phone || '',
        location: body.location || '',
        barangay: body.barangay || '',
        street: body.street || '',
        address: body.address || '',
        notes: body.notes || '',
        items,
        total,
        payment_method: body.payment || 'Cash on Delivery',
        payment_reference: body.payment_reference || '',
        payment_status: 'Pending',
        status: 'Pending',
        rider_id: null,
        rider_name: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return {
        success: true,
        order_id: reference.id,
        order_number: orderNumber,
        total,
      };
    }

    case 'cancel-order': {
      if (current?.role !== 'customer') throw new Error('Customer access required.');

      const reference = db().collection('orders').doc(String(body.order_id));

      await db().runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw new Error('Order not found.');

        const order = snapshot.data();
        if (order.customer_id !== current.id) throw new Error('You cannot cancel this order.');
        if (order.status !== 'Pending') throw new Error('Only pending orders can be cancelled.');

        transaction.update(reference, {
          status: 'Cancelled',
          updatedAt: serverTimestamp(),
        });
      });

      return { success: true };
    }

    case 'mark-order-received': {
      if (current?.role !== 'customer') throw new Error('Customer access required.');

      const reference = db().collection('orders').doc(String(body.order_id));

      await db().runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw new Error('Order not found.');

        const order = snapshot.data();
        if (order.customer_id !== current.id || order.status !== 'Delivered') {
          throw new Error('This order cannot be marked as received.');
        }

        transaction.update(reference, {
          status: 'Completed',
          customerReceivedAt: serverTimestamp(),
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      return { success: true };
    }

    case 'get-orders': {
      if (current?.role !== 'admin') throw new Error('Admin access required.');
      return { success: true, orders: await allOrders() };
    }

    case 'update-order-status': {
      if (!['admin', 'rider'].includes(current?.role)) {
        throw new Error('Staff access required.');
      }

      const nextStatus = String(body.status || '');
      const reference = db().collection('orders').doc(String(body.order_id));

      await db().runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw new Error('Order not found.');

        const order = snapshot.data();

        if (current.role === 'rider') {
          if (order.rider_id !== current.id) {
            throw new Error('This order is not assigned to you.');
          }

          if (order.status === 'Ready' && nextStatus !== 'Delivery') {
            throw new Error('A Ready pickup can only be started as Delivery.');
          }

          if (order.status === 'Delivery' && nextStatus !== 'Delivered') {
            throw new Error('A Delivery order can only be marked Delivered.');
          }

          if (!['Ready', 'Delivery'].includes(order.status)) {
            throw new Error('This order is not available for rider status updates.');
          }

          const riderSnapshot = await transaction.get(
            db().collection('users').doc(current.id),
          );

          if (
            !riderSnapshot.exists ||
            riderSnapshot.data()?.role !== 'rider'
          ) {
            throw new Error('Rider profile not found.');
          }

          const riderAvailability = riderSnapshot.data()?.availability || 'Offline';

          if (order.status === 'Ready' && riderAvailability !== 'Busy') {
            throw new Error(
              'Your rider status is not Busy. Refresh the dashboard before starting this delivery.',
            );
          }
        }

        const update = {
          status: nextStatus,
          updatedAt: serverTimestamp(),
          changedBy: current.id,
          changedRole: current.role,
        };

        if (nextStatus === 'Delivered') {
          update.completedAt = serverTimestamp();
        }

        transaction.update(reference, update);

        if (current.role === 'rider' && nextStatus === 'Delivered') {
          transaction.set(
            db().collection('users').doc(current.id),
            {
              availability: 'Available',
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      });

      return { success: true };
    }

    case 'update-payment': {
      if (current?.role !== 'admin') throw new Error('Admin access required.');

      await db().collection('orders').doc(String(body.order_id)).update({
        payment_status: body.status || 'Paid',
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    }

    case 'rider-orders': {
      if (current?.role !== 'rider') throw new Error('Rider access required.');

      // IMPORTANT: Firestore security rules are not filters. A single query
      // mixing Ready + assigned orders can be rejected by the rules. Use two
      // rule-compatible queries and merge them on the client.
      const readySnapshot = await db()
        .collection('orders')
        .where('status', '==', 'Ready')
        .get();

      const assignedSnapshot = await db()
        .collection('orders')
        .where('rider_id', '==', current.id)
        .get();

      const map = new Map();

      [...readySnapshot.docs, ...assignedSnapshot.docs].forEach(document => {
        map.set(document.id, document.id);
      });

      const orders = await Promise.all(
        [...map.values()].map(orderId => orderWithId(orderId))
      );

      orders.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

      return { success: true, orders };
    }

    case 'rider-availability': {
      if (!['rider', 'admin'].includes(current?.role)) {
        throw new Error('Staff access required.');
      }

      const snapshot = await db()
        .collection('users')
        .where('role', '==', 'rider')
        .get();

      return {
        success: true,
        riders: snapshot.docs.map(document => ({
          id: document.id,
          rider_id: document.data().rider_id || document.id,
          ...document.data(),
        })),
      };
    }

    case 'set-rider-availability': {
      if (current?.role !== 'rider') {
        throw new Error('Rider access required.');
      }

      const availability = String(body.availability || '').trim();

      if (!['Available', 'Offline'].includes(availability)) {
        throw new Error('Rider status must be Available or Offline.');
      }

      const riderReference = db().collection('users').doc(current.id);
      const riderSnapshot = await riderReference.get();

      if (!riderSnapshot.exists || riderSnapshot.data()?.role !== 'rider') {
        throw new Error('Rider profile not found.');
      }

      const riderData = riderSnapshot.data() || {};
      const currentAvailability = riderData.availability || 'Offline';

      // Busy means the rider has accepted a pickup and must finish or
      // release it before becoming offline.
      if (currentAvailability === 'Busy') {
        throw new Error(
          'You are Busy with a delivery. Finish or release your current pickup before going offline.',
        );
      }

      // Protect against an inconsistent profile where an order is assigned
      // but the rider profile says Available.
      const assignedSnapshot = await db()
        .collection('orders')
        .where('rider_id', '==', current.id)
        .get();

      const activeAssigned = assignedSnapshot.docs.some((document) => {
        const status = document.data()?.status;
        return status === 'Ready' || status === 'Delivery';
      });

      if (activeAssigned && availability === 'Offline') {
        throw new Error(
          'You have an assigned pickup. Release it or finish the delivery before going offline.',
        );
      }

      await riderReference.update({
        availability,
        updatedAt: serverTimestamp(),
      });

      return { success: true, availability };
    }

    case 'claim-order': {
      if (current?.role !== 'rider') throw new Error('Rider access required.');

      const riderReference = db().collection('users').doc(current.id);
      const orderReference = db().collection('orders').doc(String(body.order_id));

      await db().runTransaction(async transaction => {
        const [riderSnapshot, orderSnapshot] = await Promise.all([
          transaction.get(riderReference),
          transaction.get(orderReference),
        ]);

        if (!riderSnapshot.exists || riderSnapshot.data().role !== 'rider') {
          throw new Error('Rider profile not found.');
        }

        if (riderSnapshot.data().availability !== 'Available') {
          throw new Error('Set your rider status to Available before accepting a pickup.');
        }

        if (!orderSnapshot.exists) throw new Error('Order not found.');

        const order = orderSnapshot.data();

        if (order.status !== 'Ready' || order.rider_id) {
          throw new Error('This pickup has already been claimed or is no longer Ready.');
        }

        transaction.update(orderReference, {
          rider_id: current.id,
          rider_name: current.name || riderSnapshot.data().name || "Monday's Rider",
          updatedAt: serverTimestamp(),
        });

        transaction.update(riderReference, {
          availability: 'Busy',
          updatedAt: serverTimestamp(),
        });
      });

      return { success: true };
    }

    case 'release-order': {
      if (current?.role !== 'rider') throw new Error('Rider access required.');

      const riderReference = db().collection('users').doc(current.id);
      const orderReference = db().collection('orders').doc(String(body.order_id));

      await db().runTransaction(async transaction => {
        const [riderSnapshot, orderSnapshot] = await Promise.all([
          transaction.get(riderReference),
          transaction.get(orderReference),
        ]);

        if (!riderSnapshot.exists || riderSnapshot.data().role !== 'rider') {
          throw new Error('Rider profile not found.');
        }

        if (!orderSnapshot.exists) throw new Error('Order not found.');

        const order = orderSnapshot.data();

        if (order.rider_id !== current.id || order.status !== 'Ready') {
          throw new Error('Only your Ready pickup can be released.');
        }

        transaction.update(orderReference, {
          rider_id: null,
          rider_name: '',
          updatedAt: serverTimestamp(),
        });

        transaction.update(riderReference, {
          availability: 'Available',
          updatedAt: serverTimestamp(),
        });
      });

      return { success: true };
    }

    default:
      throw new Error(`Unsupported Firebase operation: ${endpoint}`);
  }
}
