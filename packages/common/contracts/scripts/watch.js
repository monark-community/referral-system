import { createPublicClient, webSocket, parseAbi } from 'viem'
import { hardhat } from 'viem/chains'

const CONTRACT_ADDRESS = '0xb7a5bd0345ef1cc5e66bf61bdec17d2461fbd968'

async function main() {
  console.log("Starting watcher...")

  const client = createPublicClient({
    chain: hardhat,
    transport: webSocket('ws://127.0.0.1:8545'),
  })

  const chainId = await client.getChainId()
  console.log("Connected to chain:", chainId)

  client.watchBlockNumber({
    onBlockNumber: (blockNumber) => {
      console.log("New block:", blockNumber)
    },
  })

  const logs = await client.getLogs({
        address: CONTRACT_ADDRESS
        })

        console.log("Existing logs:", logs)

  const abi = parseAbi([
    'event PointsAdded(address indexed user, uint256 points)'
  ])

  client.watchContractEvent({
    address: CONTRACT_ADDRESS,
    abi,
    eventName: 'PointsAdded',
    onLogs: (logs) => {
      console.log("PointsAdded event detected:")
      for (const log of logs) {
        console.log("User:", log.args?.user)
        console.log("Points:", log.args?.points?.toString())
        console.log("------------------------")
      }
    },
  })

  console.log("Watching for PointsAdded events...")
}

main().catch(console.error)