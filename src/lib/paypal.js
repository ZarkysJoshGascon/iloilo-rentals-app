const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID
const PAYPAL_SECRET = import.meta.env.VITE_PAYPAL_SECRET
const PAYPAL_API_URL = 'https://api-m.sandbox.paypal.com'

async function getAccessToken() {
  const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`)}`,
    },
    body: 'grant_type=client_credentials',
  })
  
  const data = await response.json()
  return data.access_token
}

export async function createPayPalOrder({ amount, description, bookingId }) {
  const accessToken = await getAccessToken()
  
  const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: bookingId,
          description: description,
          amount: {
            currency_code: 'PHP',
            value: Number(amount).toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: 'Iloilo Rentals',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: `${window.location.origin}/payment/success`,
        cancel_url: `${window.location.origin}/payment/cancel`,
      },
    }),
  })
  
  const data = await response.json()
  
  if (!response.ok) {
    throw new Error(data.message || 'Failed to create order')
  }
  
  return {
    orderId: data.id,
    approvalUrl: data.links?.find(link => link.rel === 'approve')?.href,
    status: data.status,
  }
}

export async function capturePayPalOrder(orderId) {
  console.log('Capturing order:', orderId)
  
  const accessToken = await getAccessToken()
  
  const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  })
  
  const data = await response.json()
  console.log('Capture response:', data)
  
  if (!response.ok) {
    throw new Error(data.message || 'Failed to capture')
  }
  
  return {
    status: data.status,
    captureId: data.purchase_units?.[0]?.payments?.captures?.[0]?.id,
    amount: data.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value,
  }
}