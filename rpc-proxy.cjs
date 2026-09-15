const http = require("http");

const TARGET = "http://127.0.0.1:8545";
const PORT = 8546;

const server = http.createServer(async (req, res) => {
  // Allow browser requests from your Next.js app
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  // Handle browser CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let body = "";

  req.on("data", chunk => {
    body += chunk;
  });

  req.on("end", async () => {
    try {
      const rpc = JSON.parse(body);

      // Log eth_call requests
      if (rpc.method) {
        const call = rpc.params?.[0];

        console.log("\n========================================");
        console.log("RPC REQUEST:", rpc.method);
        console.log("Params:", JSON.stringify(rpc.params));
        
        if (call?.data) {
          console.log("Data:", call.data);
          console.log("Selector:", call.data.slice(0, 10));
        }

        console.log("========================================\n");
      }

      // Forward request to Hardhat
      const response = await fetch(TARGET, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body,
      });

      const responseBody = await response.text();

      res.writeHead(response.status, {
        "Content-Type": "application/json",
      });

      res.end(responseBody);
    } catch (error) {
      console.error("Proxy error:", error);

      res.writeHead(500, {
        "Content-Type": "application/json",
      });

      res.end(
        JSON.stringify({
          error: String(error),
        })
      );
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`RPC proxy listening on http://127.0.0.1:${PORT}`);
  console.log(`Forwarding to ${TARGET}`);
});