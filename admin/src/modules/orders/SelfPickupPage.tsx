'use client';
// Self Pickup Orders — same listing as Orders (OrderController@selfPickup) filtered to delivery_type == 'self_pickup', with OTP handover.
import { OrdersList } from './OrdersPage';

export default function SelfPickupPage() { return <OrdersList selfPickup />; }
