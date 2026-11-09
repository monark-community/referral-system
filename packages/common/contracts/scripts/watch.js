// Purpose: Allows a dev to add a listener to the contract event
// Notes:
// - Current events are 'InviteChanged' and 'PointsAdded'


import { createPublicClient, webSocket, parseAbi, getAddress } from 'viem'
import { hardhat, sepolia } from 'viem/chains'

const network = process.env.BLOCKCHAIN_NETWORK || 'localhost'
const chain = network === 'sepolia' ? sepolia : hardhat
const rpcUrl = process.env.RPC_WEBSOCKET_URL || (network === 'localhost' ? 'ws://127.0.0.1:8545' : undefined)
const CONTRACT_ADDRESS = getAddress(process.env.REFERRAL_CONTRACT_ADDRESS || '0x5fbdb2315678afecb367f032d93f642f64180aa3')

async function main() {
  console.log("Starting watcher...")
  if (!rpcUrl) throw new Error(`RPC_WEBSOCKET_URL is required for ${network}`)

  const client = createPublicClient({
    chain,
    transport: webSocket(rpcUrl),
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
    'event InviteChanged(bytes32 indexed inviteId, address indexed referrer, uint8 status)'
  ])

  client.watchEvent({
  onLogs: (logs) => {
    console.log("RAW LOGS:", logs)
  }
})

client.watchContractEvent({
  address: CONTRACT_ADDRESS,
  abi,
  eventName: 'InviteChanged',
  pollingInterval: 1000,
  fromBlock: 0n,  // optional, only needed to replay past logs
  onLogs: (logs) => {
    console.log(logs)
    for (const log of logs) {
      console.log("InviteId:", log.args?.inviteId)
      console.log("Referrer:", log.args?.referrer)
      console.log("Status:", log.args?.status)
    }
  },
})

  console.log("Watching for InviteChanged events...")
}

main().catch(console.error)
