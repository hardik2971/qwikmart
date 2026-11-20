/**
 * Website / app CMS pages (Firestore pages/{slug}): about, terms, privacy, refund, delete-account.
 * HTML uses only the tags styled by `.prose-sb` (h2, h3, p, ul, ol, table, .note, .grid-3, .updated, .lead).
 * Values in {{…}} are filled from settings/public by update-cms-pages.ts.
 */

export const UPDATED = '20 October 2026';
/** Privacy Policy and Delete Account pages (revised separately from the other pages). */
export const PRIVACY_UPDATED = '20 November 2026';
/** Terms of Service (also the Google Play 'Terms of Service' URL). */
export const TERMS_UPDATED = '20 November 2026';

const about = `
<p class="lead">{{app}} is a hyperlocal quick-commerce and online shopping platform. We bring groceries, fresh produce, daily essentials, beauty, pharmacy, electronics, fashion and home products from trusted local stores to your door — in minutes.</p>

<div class="grid-3">
  <div><strong>10–30 min</strong>Quick delivery from a store near you</div>
  <div><strong>12 categories</strong>From fresh produce to electronics</div>
  <div><strong>7 AM – 11 PM</strong>Ordering and support, every day</div>
</div>

<h2>Our story</h2>
<p>{{app}} started with a simple idea: shopping for everyday needs should not take a trip across town or a whole afternoon. We partner with neighbourhood stores and dark stores, list their live stock online and connect them with our own delivery partners, so the products you order are picked, packed and on their way within minutes.</p>

<h2>What you can do with {{app}}</h2>
<ul>
  <li><strong>Quick commerce</strong> — groceries, fruits &amp; vegetables, dairy, snacks, beverages, personal care and household essentials delivered in minutes from the nearest store in your zone.</li>
  <li><strong>eCommerce</strong> — a wider catalogue of electronics, mobiles, fashion, home &amp; kitchen and more, delivered in 1–4 days.</li>
  <li><strong>Self pickup</strong> — order online and collect from the store when it suits you.</li>
  <li><strong>Live tracking</strong> — follow your delivery partner on the map and share a one-time delivery code for a safe hand-over.</li>
  <li><strong>{{app}} Wallet</strong> — fast refunds, cashback and referral rewards in one place; pay in a single tap.</li>
  <li><strong>Secure payments</strong> — UPI, cards, net banking and wallets through Razorpay, plus Cash on Delivery.</li>
</ul>

<h2>Our promise</h2>
<ul>
  <li><strong>Fresh and genuine</strong> — products come from verified stores and brands; fresh produce is checked before packing.</li>
  <li><strong>Fair prices</strong> — the price you see at checkout, including taxes and fees, is the price you pay. No hidden charges.</li>
  <li><strong>Easy returns</strong> — if something is wrong, damaged or missing, tell us and we will make it right. See our <a href="/pages/refund">Return &amp; Refund Policy</a>.</li>
  <li><strong>Privacy first</strong> — we only use your data to run your orders and your account. Read our <a href="/pages/privacy">Privacy Policy</a>.</li>
</ul>

<h2>Grow with us</h2>
<h3>Sell on {{app}}</h3>
<p>Own a grocery, pharmacy or speciality store? List your products, receive orders from customers nearby and manage stock, orders and payouts from the {{app}} Store panel. Write to <a href="mailto:{{email}}">{{email}}</a> with the subject "Become a seller".</p>
<h3>Deliver with {{app}}</h3>
<p>Earn on your own schedule as a {{app}} delivery partner. Download the <strong>{{app}} Delivery</strong> app, register with your vehicle and documents, and start accepting orders once you are approved.</p>

<h2>Company information</h2>
<table>
  <tr><th>Legal name</th><td>{{company}}</td></tr>
  <tr><th>Registered office</th><td>{{address}}</td></tr>
  <tr><th>GSTIN</th><td>{{gstin}}</td></tr>
  <tr><th>Customer support</th><td><a href="mailto:{{email}}">{{email}}</a> · <a href="tel:{{phone_tel}}">{{phone}}</a></td></tr>
</table>
`;

const terms = `
<p class="updated">Last updated: ${TERMS_UPDATED}</p>
<p class="lead">These Terms of Service ("Terms") govern your use of the {{app}} website, the <strong>{{app}}</strong> customer app, the <strong>{{app}} Delivery</strong> partner app and all related services (together, the "Platform"), operated by <strong>{{company}}</strong>, {{address}} ("{{app}}", "we", "us", "our").</p>
<p>By downloading or using our apps, creating an account, browsing or placing an order you agree to these Terms and to our <a href="/pages/privacy">Privacy Policy</a>. If you do not agree, please do not use the Platform.</p>

<div class="note"><strong>Who these Terms apply to:</strong> sections 1–14 apply to everyone, including customers who shop on the website or the {{app}} app. Section 15 also applies to delivery partners who use the {{app}} Delivery app.</div>

<h2>1. About the Platform</h2>
<p>{{app}} is an online marketplace for groceries, daily essentials and other products. Products are sold by independent partner stores ("Sellers") listed on the Platform. Orders are delivered by {{app}} delivery partners or collected by you at the store (self pickup). {{app}} provides the technology, payment collection, customer support and delivery coordination. The Seller of each order is shown in the order details and on the invoice.</p>

<h2>2. Eligibility and your account</h2>
<ul>
  <li>You must be at least 18 years old and able to enter into a binding contract under the Indian Contract Act, 1872.</li>
  <li>You can sign in with your mobile number and a one-time password (OTP), or with your e-mail address and password. Keep your login details confidential. You are responsible for all activity on your account.</li>
  <li>Give us an accurate name, phone number and address so we can deliver your orders. Tell us immediately at <a href="mailto:{{email}}">{{email}}</a> if you suspect unauthorised use of your account.</li>
  <li>You may browse and fill a cart as a guest. You need an account to place orders, use the Wallet, refer friends or write reviews.</li>
  <li>We may suspend or close accounts that break these Terms, misuse offers or referrals, or act fraudulently.</li>
  <li>You can delete your account at any time in the app (<strong>Profile → Delete account</strong>) or as described on our <a href="/pages/delete-account">Delete Account</a> page.</li>
</ul>

<h2>3. Products, prices and availability</h2>
<ul>
  <li>Product images are for illustration; packaging, colour and size may vary slightly. Product details, MRP, ingredients and expiry information come from the Seller and the brand.</li>
  <li>All prices are in Indian Rupees (₹) and include applicable taxes (GST) unless stated otherwise.</li>
  <li>Any <strong>delivery charge</strong>, <strong>peak-time (surge) charge</strong> or other <strong>zone charge</strong> is shown in your cart before you pay. Self-pickup orders have no delivery charge.</li>
  <li>Stock changes quickly. If an item becomes unavailable after you order, we remove it from the order and refund the amount for that item.</li>
  <li>If a product is listed at a clearly wrong price because of a technical or typographical error, we may cancel the order and refund you in full.</li>
  <li>We may limit the quantity of an item per order so that products stay available for everyone.</li>
</ul>

<h2>4. Orders and delivery</h2>
<ul>
  <li>Your order is an offer to buy. A contract is formed when the Seller confirms the order (status <em>Received</em>).</li>
  <li><strong>Quick</strong> orders are fulfilled by a store in your delivery zone. Delivery times shown in the app (for example "Delivery in 10 minutes") are estimates and can change with traffic, weather and demand.</li>
  <li><strong>eCommerce</strong> orders are usually delivered in 1–4 days.</li>
  <li>Deliveries are confirmed with a <strong>one-time delivery code (OTP)</strong> shown in your order. Share it with the delivery partner only when you receive your order.</li>
  <li>Please be available at the delivery address. If the delivery partner cannot reach you after reasonable attempts, the order may be cancelled; perishable items cannot be redelivered.</li>
  <li>You can follow your order and the delivery partner's live location in the app or on the website while it is out for delivery.</li>
  <li>Restricted products (for example medicines that need a prescription) may need extra verification and can be refused by the Seller.</li>
</ul>

<h2>5. Cancellation</h2>
<p>You can cancel an order from <strong>My Orders</strong> while its status is <em>Payment pending</em>, <em>Received</em> or <em>Processed</em>. Once it is packed, shipped or out for delivery it can no longer be cancelled; use a return instead where the product allows it. Some items are marked as non-cancellable on the product page. We or the Seller may cancel an order if an item is out of stock, the address cannot be served, payment fails or we suspect fraud. Refunds are explained in our <a href="/pages/refund">Return &amp; Refund Policy</a>.</p>

<h2>6. Payments</h2>
<ul>
  <li>Online payments (UPI, debit and credit cards, net banking and other methods offered at checkout) are processed by our payment partner ({{payment_partners}}). You can also pay by Cash on Delivery (up to ₹{{cod_max}} per order, where available) or with your {{app}} Wallet.</li>
  <li>Card and UPI details are entered on the payment partner's secure checkout. {{app}} does not see or store your full card number, CVV or UPI PIN.</li>
  <li>If money is deducted but the order is not confirmed, the payment partner reverses it automatically, or we refund it once confirmed, usually within 5–7 working days.</li>
  <li>Please pay the exact amount for Cash on Delivery orders. Repeatedly refusing COD orders may lead to COD being disabled for your account.</li>
</ul>

<h2>7. {{app}} Wallet</h2>
<ul>
  <li>The Wallet is a closed-loop store balance that can be used only on {{app}}. It holds refunds, cashback, referral rewards and money you add (₹{{wallet_min}} – ₹{{wallet_max}} per top-up).</li>
  <li>Wallet balance does not earn interest and cannot be transferred to another user. Promotional credits may have an expiry date or minimum order value, shown when they are given.</li>
  <li>Money you added yourself can be withdrawn to your bank account on request (minimum ₹{{withdraw_min}}), subject to verification. Promotional credits cannot be withdrawn.</li>
  <li>Any Wallet balance is lost if you delete your account, so use or withdraw it first.</li>
</ul>

<h2>8. Offers, coupons and referrals</h2>
<p>Coupons and offers have their own conditions (minimum order, validity, one use per user, eligible products), shown with the offer. Under the referral programme, when a friend signs up with your code and completes their first order of at least ₹{{ref_min}}, you receive ₹{{ref_referrer}} and your friend receives ₹{{ref_referred}} in the Wallet. We may change or end offers at any time, and may withdraw rewards obtained through fake accounts, self-referrals or other misuse.</p>

<h2>9. Returns and refunds</h2>
<p>Products that allow returns show the return window on the product page. You can request a return from <strong>My Orders</strong> with photos of the item. Full details are in our <a href="/pages/refund">Return &amp; Refund Policy</a>.</p>

<h2>10. Reviews, chat and content you post</h2>
<p>You may rate products, post reviews and photos, and chat with our support team. Your content must be honest, relate to your own experience and must not be unlawful, abusive, misleading or infringe anyone's rights. You give {{app}} a non-exclusive, royalty-free licence to display reviews on the Platform. We may remove content that breaks these rules.</p>

<h2>11. Acceptable use</h2>
<p>You agree not to:</p>
<ul>
  <li>use the Platform for any unlawful purpose or to place fake orders;</li>
  <li>resell products bought at promotional prices in commercial quantities;</li>
  <li>scrape, copy, modify, reverse-engineer or interfere with the security of the website or apps;</li>
  <li>create multiple accounts to misuse offers, referrals or the Wallet;</li>
  <li>harass, threaten or abuse delivery partners, Sellers or support staff.</li>
</ul>

<h2>12. The apps and third-party services</h2>
<ul>
  <li>We grant you a personal, non-transferable, revocable licence to use the {{app}} apps on your own device for their intended purpose. Download the apps only from official stores such as Google Play.</li>
  <li>Some features rely on third parties, such as payment partners, maps and push-notification services. Their own terms apply to their services, and we are not responsible for their availability.</li>
  <li>Google Play and other app stores are not parties to these Terms and are not responsible for the apps or their content.</li>
  <li>We may update the apps to add features or fix issues. Some updates may be required to keep using the Platform.</li>
</ul>

<h2>13. Intellectual property</h2>
<p>The {{app}} name, logo, website and app design, software and content are owned by or licensed to {{company}}. Brand names and product images belong to their respective owners. You may not use them without written permission.</p>

<h2>14. Liability</h2>
<p>We work hard to keep the Platform accurate and available, but it is provided "as is" and may sometimes be unavailable for maintenance or reasons beyond our control. To the extent permitted by law, {{app}} is not liable for indirect or consequential losses, and our total liability for any order is limited to the amount you paid for that order. Nothing in these Terms limits your rights as a consumer under the Consumer Protection Act, 2019.</p>

<h2>15. Delivery partners</h2>
<p>This section also applies if you register as a delivery partner in the <strong>{{app}} Delivery</strong> app.</p>
<ul>
  <li><strong>Registration and approval</strong> — you must be at least 18, hold a valid driving licence for your vehicle and provide true identity, vehicle and bank details. We review every registration and may approve, reject or ask for more information. You can only accept orders after approval.</li>
  <li><strong>Independent partner</strong> — you choose when to go online and which orders to accept. You are an independent service provider, not an employee of {{company}}, and you are responsible for your own vehicle, licence, insurance, fuel and taxes.</li>
  <li><strong>Location</strong> — while you are online the app shares your live location, also in the background, to offer you nearby orders and to show customers where their order is. Going offline stops location sharing. See our <a href="/pages/privacy">Privacy Policy</a>.</li>
  <li><strong>Deliveries</strong> — follow traffic laws, handle orders with care, and confirm each delivery with the customer's one-time delivery code. Never ask for the code before handing over the order.</li>
  <li><strong>Cash on Delivery</strong> — collect the exact amount shown, confirm it in the app and settle the cash you hold with {{app}} as instructed. Unsettled cash may block new orders, withdrawals and account deletion.</li>
  <li><strong>Earnings and payouts</strong> — your commission for each delivery is shown in the app. You can request a withdrawal of your earnings to your registered bank account; payouts are subject to verification and to settlement of any cash in hand.</li>
  <li><strong>Conduct and deactivation</strong> — be respectful to customers and store staff. We may suspend or deactivate partners who give false information, commit fraud, mishandle cash, behave unsafely or repeatedly fail deliveries.</li>
</ul>

<h2>16. Grievance redressal</h2>
<p>In line with the Consumer Protection (E-Commerce) Rules, 2020 and the Information Technology Rules, 2021, you can raise any complaint with our Grievance Officer:</p>
<table>
  <tr><th>Grievance Officer</th><td>Customer Experience Team, {{company}}</td></tr>
  <tr><th>Address</th><td>{{address}}</td></tr>
  <tr><th>E-mail</th><td><a href="mailto:{{email}}?subject=Grievance">{{email}}</a> (subject: "Grievance")</td></tr>
  <tr><th>Phone</th><td><a href="tel:{{phone_tel}}">{{phone}}</a></td></tr>
</table>
<p>We acknowledge complaints within 48 hours and aim to resolve them within one month of receiving them.</p>

<h2>17. Governing law and changes</h2>
<p>These Terms are governed by the laws of India. The courts of Mumbai, Maharashtra have jurisdiction, without affecting your right to approach a consumer commission. We may update these Terms from time to time; the date at the top shows the latest version. We will announce important changes in the app or on the website, and continued use of the Platform after an update means you accept the updated Terms.</p>

<h2>18. Contact us</h2>
<p>Questions about these Terms? E-mail <a href="mailto:{{email}}">{{email}}</a> or call <a href="tel:{{phone_tel}}">{{phone}}</a>.</p>
`;

const privacy = `
<p class="updated">Last updated: ${PRIVACY_UPDATED}</p>
<p class="lead">This Privacy Policy explains how <strong>{{company}}</strong> ("{{app}}", "we", "us", "our") collects, uses, shares and protects your personal data when you use the {{app}} website, the {{app}} customer app and the {{app}} Delivery partner app (together, the "Platform").</p>
<p>We process personal data in line with India's Digital Personal Data Protection Act, 2023 (DPDP Act), the Information Technology Act, 2000 and the rules made under them. By using the Platform you agree to this policy. If you do not agree, please do not use the Platform.</p>

<div class="note"><strong>In short:</strong> we use your data to deliver your orders, run your account, pay our delivery partners and keep the Platform safe. We do <strong>not</strong> sell your data, we do <strong>not</strong> show third-party advertising and we do <strong>not</strong> use third-party analytics or advertising trackers in our apps or website.</div>

<h2>1. Who is responsible for your data</h2>
<p><strong>{{company}}</strong>, {{address}}, is the Data Fiduciary for personal data processed on the Platform. Partner stores ("Sellers") receive only the order details they need to prepare your order. Contact details for privacy questions are in section 11.</p>

<h2>2. Data we collect</h2>
<h3>2.1 Customers (website and customer app)</h3>
<table>
  <tr><th>Data</th><th>What it includes</th><th>Why we need it</th></tr>
  <tr><td>Guest session</td><td>A random user ID created when you first open the Platform, before you log in</td><td>To keep your cart; it is merged into your account when you log in</td></tr>
  <tr><td>Account details</td><td>Name, mobile number, e-mail address, password (stored only in encrypted, hashed form by Google Firebase), profile photo (optional), language and referral code</td><td>Login, your profile and order communication</td></tr>
  <tr><td>Addresses and location</td><td>Saved delivery addresses with a map pin; your device's precise location, <strong>only when you allow it</strong></td><td>To find your delivery zone and the nearest store, show delivery time and deliver your order. You can choose a city or pin manually instead.</td></tr>
  <tr><td>Orders and payments</td><td>Items, prices, coupons, invoices, cancellations, returns, refunds, wallet and referral transactions, the payment method and a payment reference from our payment partner</td><td>To process, deliver, bill and support your orders</td></tr>
  <tr><td>Content you share</td><td>Product reviews, ratings and photos (reviews are public), return photos, support chat and contact-form messages</td><td>Reviews, returns and customer support</td></tr>
  <tr><td>Device and technical data</td><td>Push-notification token, app version, device type, language, IP address and security logs</td><td>Order notifications, fraud prevention and keeping the service secure</td></tr>
</table>
<p><strong>Card, UPI and net-banking details</strong> are entered directly on the secure checkout of our payment partner ({{payment_partners}}). We receive only a payment reference and status, never your full card number, CVV, UPI PIN or banking password.</p>

<h3>2.2 Delivery partners (Delivery partner app)</h3>
<table>
  <tr><th>Data</th><th>What it includes</th><th>Why we need it</th></tr>
  <tr><td>Registration and verification</td><td>Name, phone, e-mail, address, date of birth, delivery zone, vehicle type and number, driving licence and ID proof (photos or files you upload)</td><td>To verify and approve you as a delivery partner</td></tr>
  <tr><td>Bank details</td><td>Account holder name, account number, IFSC / bank details</td><td>To pay your earnings and withdrawals</td></tr>
  <tr><td><strong>Precise location</strong></td><td>Your GPS position, sent about every 10 seconds <strong>only while you are online</strong>, including when the app is in the background during your shift (a permanent notification is shown while this happens)</td><td>To offer you nearby orders, assign deliveries and let the customer track their order live. Location is <strong>not</strong> collected when you are offline.</td></tr>
  <tr><td>Work records</td><td>Accepted, rejected and delivered orders, delivery OTP confirmations, cash collected, earnings, ratings and withdrawal requests</td><td>Payouts, cash settlement, support and quality</td></tr>
</table>

<h3>2.3 Store owners and staff</h3>
<p>For people who use the Store or Admin panels we collect name, e-mail, phone, role and store, and a log of actions such as order status changes, so that work can be tracked and secured.</p>

<h3>2.4 App permissions</h3>
<table>
  <tr><th>Permission</th><th>Used for</th><th>Required?</th></tr>
  <tr><td>Location</td><td>Customer app: finding your zone and address. Delivery app: live location while online.</td><td>Optional for customers; required for delivery partners to go online</td></tr>
  <tr><td>Camera and photos</td><td>Profile photo, review and return photos, delivery partner documents</td><td>Optional; only when you choose to add a photo</td></tr>
  <tr><td>Notifications</td><td>Order updates, new orders for delivery partners, support replies and offers</td><td>Optional</td></tr>
</table>
<p>You can change these permissions at any time in your phone's settings.</p>

<h3>2.5 Cookies and local storage (website)</h3>
<p>The website uses only essential browser storage to keep you signed in and to remember your cart, delivery location, language and theme. When you log in with your mobile number, <strong>Google reCAPTCHA</strong> checks that the request comes from a real person, and Google may set its own cookies for this purpose. We do not use advertising or cross-site tracking cookies.</p>

<h2>3. How we use your data</h2>
<ul>
  <li>To create and manage your account, verify your login (OTP or password) and protect it.</li>
  <li>To process, prepare, deliver and track your orders, and to handle payments, refunds, returns, wallet and referral rewards.</li>
  <li>To send order updates by push notification, e-mail or SMS, and — unless you opt out — offers and announcements from {{app}}.</li>
  <li>To answer your questions, complaints and support chats.</li>
  <li>To verify, assign and pay delivery partners and settle cash collected on delivery.</li>
  <li>To prevent fraud and misuse of offers, wallet and referrals, and to protect our users, Sellers and delivery partners.</li>
  <li>To improve our catalogue, search and service using aggregated statistics that do not identify you.</li>
  <li>To comply with legal, tax and accounting obligations and lawful requests from authorities.</li>
</ul>
<p>We use your data on the basis of your consent (for example location and notifications), to perform the services you request, and for legitimate uses permitted under the DPDP Act, such as complying with the law.</p>

<h2>4. Who we share data with</h2>
<p>We share only what each party needs:</p>
<ul>
  <li><strong>Partner stores</strong> — the items you ordered, your name and, for self-pickup orders, your phone number, so they can prepare your order.</li>
  <li><strong>Delivery partners</strong> — your name, phone number and delivery address for the order they deliver. During delivery, customers see the assigned delivery partner's name, phone number and live location.</li>
  <li><strong>Service providers</strong> who process data for us under contract:
    <ul>
      <li><strong>Google Firebase / Google Cloud</strong> — hosting, database, file storage, login and OTP SMS, reCAPTCHA and push notifications;</li>
      <li><strong>Payment partners</strong> ({{payment_partners}}) — to process online payments and refunds;</li>
      <li><strong>E-mail and SMS providers</strong> — to send order e-mails and messages;</li>
      <li><strong>OpenStreetMap</strong> — map images and converting a map pin into an address on the website (the pin coordinates are sent; no name or account details).</li>
    </ul>
  </li>
  <li><strong>Authorities</strong> — when required by law, a court order or a government request, or to protect the rights and safety of our users and the public.</li>
  <li><strong>Business transfer</strong> — if {{company}} is merged or sold, your data may move to the new owner, who must respect this policy.</li>
</ul>
<p>Our team may use Google's Gemini AI to help write product descriptions and translations. <strong>No customer or delivery-partner personal data is sent to it.</strong></p>
<p>We do not sell or rent your personal data.</p>

<h2>5. Where your data is stored and how we protect it</h2>
<p>Our database and files are stored on Google Cloud in <strong>Mumbai, India</strong> (region asia-south1). Some of our service providers, such as Google's global network and payment or e-mail providers, may process data in other countries, with safeguards required by law.</p>
<ul>
  <li>All connections use encryption (HTTPS/TLS), and stored data is encrypted by Google Cloud.</li>
  <li>Access is restricted by role: stores see only their own orders, delivery partners see only orders offered or assigned to them, and staff see only what their role allows.</li>
  <li>The delivery OTP is visible only to the customer, and delivery partner documents are visible only to our team.</li>
</ul>
<p>No system is perfectly secure. If a personal data breach affects you, we will inform you and the Data Protection Board of India as required by law.</p>

<h2>6. How long we keep data</h2>
<table>
  <tr><th>Data</th><th>How long</th></tr>
  <tr><td>Account and profile</td><td>While your account is active; anonymised when you delete it</td></tr>
  <tr><td>Saved addresses, cart, favourites and notifications</td><td>While your account is active; deleted when you delete it</td></tr>
  <tr><td>Orders, invoices, payments, refunds and wallet transactions</td><td>8 years, as required by tax and accounting law</td></tr>
  <tr><td>Support chats and contact messages</td><td>Up to 2 years</td></tr>
  <tr><td>Delivery partner documents, address and bank details</td><td>While the partner account is active; removed when the account is deleted (payout records are kept for 8 years)</td></tr>
  <tr><td>Delivery partner location</td><td>Only the latest position is kept while online and it is cleared when the account is deleted; the rider position on a completed order stays with that order record</td></tr>
</table>

<h2>7. Your rights and choices</h2>
<ul>
  <li><strong>Access and correction</strong> — view and update your name, photo, addresses and other details in your Profile, or ask us for a summary of the personal data we hold about you.</li>
  <li><strong>Deletion</strong> — delete your account in the app (<strong>Profile → Delete account</strong>) or follow the steps on our <a href="/pages/delete-account">Delete Account</a> page. Your login is removed, your profile is anonymised as "Deleted user", and your saved addresses, cart, favourites and notifications are deleted. Records that the law requires us to keep, such as invoices, are retained as described in section 6.</li>
  <li><strong>Withdraw consent</strong> — turn off location or notifications in your phone's settings, opt out of promotional messages, or contact us. Withdrawing consent does not affect processing that happened before.</li>
  <li><strong>Nominate</strong> — you may nominate another person to exercise your rights in the event of your death or incapacity, by writing to us.</li>
  <li><strong>Grievances</strong> — contact our Grievance Officer (section 11). If you are not satisfied with our response, you may complain to the Data Protection Board of India.</li>
</ul>

<h2>8. Children</h2>
<p>The Platform is intended for people aged 18 and over. We do not knowingly collect personal data from children. If you believe a child has given us personal data, please contact us and we will delete it.</p>

<h2>9. Links to other services</h2>
<p>Payment pages, maps and other external links are operated by third parties under their own privacy policies. Please read them before sharing data with those services.</p>

<h2>10. Changes to this policy</h2>
<p>We may update this policy when the Platform or the law changes. The date at the top shows the current version. We will announce important changes in the app, on the website or by e-mail.</p>

<h2>11. Contact us and Grievance Officer</h2>
<table>
  <tr><th>Company</th><td>{{company}}</td></tr>
  <tr><th>Grievance Officer</th><td>Data Protection &amp; Customer Experience Team, {{company}}</td></tr>
  <tr><th>Address</th><td>{{address}}</td></tr>
  <tr><th>E-mail</th><td><a href="mailto:{{email}}?subject=Privacy">{{email}}</a> (subject: "Privacy")</td></tr>
  <tr><th>Phone</th><td><a href="tel:{{phone_tel}}">{{phone}}</a></td></tr>
</table>
`;

const refund = `
<p class="updated">Last updated: ${UPDATED}</p>
<p>We want you to be happy with every order. This policy explains when you can cancel, return or replace items and how refunds are paid. It is part of our <a href="/pages/terms">Terms &amp; Conditions</a>.</p>

<h2>1. Cancelling an order</h2>
<ul>
  <li>Open <strong>My Orders</strong> → select the order → <strong>Cancel order</strong>. You can cancel until the order is packed (statuses <em>Payment pending</em>, <em>Received</em> or <em>Processed</em>).</li>
  <li>Once the order is packed, out for delivery or delivered it cannot be cancelled. Use a return instead if the item is eligible.</li>
  <li>Some items (for example made-to-order or special-price items) are marked <em>non-cancellable</em> on the product page.</li>
  <li>If we or the store cancel your order (item out of stock, address not serviceable, payment issue), you get a full refund.</li>
</ul>

<h2>2. Returns and replacements</h2>
<p>You can request a return from <strong>My Orders</strong> → the delivered order → <strong>Return</strong>, choosing the item, the quantity and the reason, and adding photos. The return window is shown on each product page ("Returnable within X days"); items without a return window cannot be returned except as described below.</p>
<div class="table-wrap"><table>
  <tr><th>Category</th><th>Return window</th><th>Conditions</th></tr>
  <tr><td>Fresh fruits &amp; vegetables, dairy, bakery, meat</td><td>Report at delivery or within 24 hours</td><td>Damaged, spoiled, wrong or missing items only — please share a photo</td></tr>
  <tr><td>Grocery, snacks, beverages, household</td><td>As shown on the product (usually 2–7 days)</td><td>Unopened, with original packaging and seal</td></tr>
  <tr><td>Beauty, personal care, pharmacy</td><td>As shown on the product</td><td>Sealed and unused; opened items only if damaged or wrong</td></tr>
  <tr><td>Electronics, mobiles</td><td>As shown on the product (usually 7 days)</td><td>Damaged, defective or not as described; with box, accessories, invoice and unchanged IMEI / serial number</td></tr>
  <tr><td>Fashion, home &amp; kitchen</td><td>As shown on the product (usually 7 days)</td><td>Unused, unwashed, with original tags and packaging</td></tr>
</table></div>
<p><strong>Not returnable</strong> (unless damaged, defective, expired or wrong): innerwear, opened personal-care and hygiene products, medicines and health devices once opened, gift cards and items marked "Non-returnable".</p>
<p><strong>Always covered:</strong> if an item is delivered damaged, expired, wrong or missing, contact us within 48 hours of delivery and we will replace it or refund it, whatever the product's return window.</p>

<h2>3. How a return works</h2>
<ol>
  <li>You submit the return request with photos.</li>
  <li>Our team reviews it, usually within 24 hours, and approves or rejects it (you will see the reason).</li>
  <li>For approved returns, a delivery partner collects the item from your address. For low-value perishables we may refund without pickup.</li>
  <li>After the item is picked up and checked, the refund is issued.</li>
</ol>

<h2>4. Refunds</h2>
<div class="table-wrap"><table>
  <tr><th>Situation</th><th>Refund to</th><th>Time</th></tr>
  <tr><td>Cancelled order (paid online or with Wallet)</td><td>{{app}} Wallet</td><td>Instant, once cancelled</td></tr>
  <tr><td>Approved return</td><td>{{app}} Wallet (default)</td><td>Instant, after pickup and quality check</td></tr>
  <tr><td>Approved return — refund to original method on request</td><td>UPI / card / bank account used (via Razorpay)</td><td>5–7 working days after approval (bank timelines apply)</td></tr>
  <tr><td>Cash on Delivery orders</td><td>{{app}} Wallet, or your bank account on request</td><td>Wallet instant; bank 5–7 working days</td></tr>
  <tr><td>Money deducted but order not placed</td><td>Original payment method (automatic reversal)</td><td>5–7 working days</td></tr>
</table></div>
<p>Refunds include the item price and taxes. Delivery and handling fees are refunded when the whole order is cancelled by us or when the return is due to our error (damaged, wrong, missing or expired item). Coupon discounts are adjusted proportionally. Wallet money can be used on your next order or, for money you added yourself, withdrawn to your bank account from the Wallet screen.</p>

<h2>5. Need help?</h2>
<p>Use <strong>Help &amp; Support</strong> in the app or the website, or contact us at <a href="mailto:{{email}}">{{email}}</a> / <a href="tel:{{phone_tel}}">{{phone}}</a> (7 AM – 11 PM, every day). Please keep your order number handy.</p>
`;

const deleteAccount = `
<p class="updated">Last updated: ${PRIVACY_UPDATED}</p>
<p class="lead">You can delete your {{app}} account at any time. This page explains how to do it, what is deleted and what we must keep. It applies to the {{app}} customer app, the {{app}} website and the {{app}} Delivery partner app.</p>

<h2>Option 1 — Delete in the app (instant)</h2>
<h3>{{app}} customer app</h3>
<ol>
  <li>Open the {{app}} app and sign in.</li>
  <li>Go to <strong>Profile</strong> → <strong>Delete account</strong>.</li>
  <li>Read the information and confirm. You are signed out and the account is deleted immediately.</li>
</ol>
<h3>{{app}} Delivery partner app</h3>
<ol>
  <li>Open {{app}} Delivery and sign in.</li>
  <li>Go to <strong>Profile</strong> → <strong>Delete account</strong> and confirm.</li>
  <li>The account can be deleted only when you have no active orders and no unsettled cash in hand. Settle cash with your hub first.</li>
</ol>

<h2>Option 2 — Request by e-mail (without the app)</h2>
<p>Send an e-mail to <a href="mailto:{{email}}?subject=Delete%20my%20account">{{email}}</a> with the subject <strong>"Delete my account"</strong> from the e-mail address registered with your account, or include the mobile number registered with your account. To protect you, we may ask you to confirm the request with a one-time code. We complete deletion requests within <strong>7 days</strong> and confirm by e-mail.</p>

<h2>What is deleted</h2>
<ul>
  <li>Your login (phone / e-mail sign-in) — you can no longer sign in with this account.</li>
  <li>Name, e-mail address, phone number and profile photo (your profile is anonymised as "Deleted user").</li>
  <li>Saved addresses, cart, favourites, notifications and push-notification tokens.</li>
  <li><strong>Delivery partners:</strong> address, location data, driving licence and ID documents, and bank account details.</li>
</ul>

<h2>What we keep, and why</h2>
<table>
  <tr><th>Data</th><th>Why</th><th>How long</th></tr>
  <tr><td>Order, invoice, payment and refund records (items, amounts, delivery address of past orders)</td><td>Tax, accounting and legal obligations; handling disputes and chargebacks</td><td>8 years</td></tr>
  <tr><td>Wallet transactions and delivery-partner payout records</td><td>Financial record-keeping</td><td>8 years</td></tr>
  <tr><td>Product reviews</td><td>Shown anonymously as "Deleted user"; ask us if you want them removed</td><td>Until removed</td></tr>
  <tr><td>Support conversations</td><td>Quality and dispute handling</td><td>Up to 2 years</td></tr>
</table>

<div class="note"><strong>Before you delete:</strong> any remaining <strong>Wallet balance</strong>, referral rewards and coupons are lost when the account is deleted. Use your balance or withdraw the money you added (Wallet → Withdraw) first. Pending orders and returns should be completed or cancelled.</div>

<h2>Questions</h2>
<p>Contact us at <a href="mailto:{{email}}">{{email}}</a> or <a href="tel:{{phone_tel}}">{{phone}}</a>. See also our <a href="/pages/privacy">Privacy Policy</a>.</p>
`;

export const PAGES: Record<string, { title: Record<'en' | 'hi' | 'ar', string>; html: string }> = {
  about: { title: { en: 'About Us', hi: 'हमारे बारे में', ar: 'من نحن' }, html: about },
  terms: { title: { en: 'Terms of Service', hi: 'नियम और शर्तें', ar: 'الشروط والأحكام' }, html: terms },
  privacy: { title: { en: 'Privacy Policy', hi: 'गोपनीयता नीति', ar: 'سياسة الخصوصية' }, html: privacy },
  refund: { title: { en: 'Return & Refund Policy', hi: 'वापसी और रिफंड नीति', ar: 'سياسة الإرجاع والاسترداد' }, html: refund },
  'delete-account': { title: { en: 'Delete Your Account', hi: 'अपना खाता हटाएं', ar: 'حذف حسابك' }, html: deleteAccount },
};
