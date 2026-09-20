// Local UI toggles — zero-conflict layer (this file does not exist upstream).
//
// Each flag switches off one specific piece of upstream UI, so the edit inside the
// upstream component stays a single condition check. See docs/CUSTOMIZATION.md.

export const UI_FLAGS = {
  // Endpoint page banner: "Enable "Require login" and set a custom password before
  // activating the tunnel." It renders whenever login is off AND no tunnel is
  // running — i.e. permanently for anyone who simply does not use the tunnel, which
  // is why it was turned off here.
  //
  // Hiding it does NOT weaken the security gate: both enable buttons still refuse to
  // open the activation modal and report the same reason (the isLoginUnsafe checks
  // in EndpointPageClient.js), and the "tunnel is active" security warnings further
  // down the page are untouched.
  showTunnelSecurityNag: false,
};
