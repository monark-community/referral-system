import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWebSocketClient } from '../clients.ts';
import 'dotenv/config';


test('createWebSocketClient should create a client able to handle Smart Contract Events', () => {
    const { publicClient } = createWebSocketClient('localhost');

    // Check if the  the watchContractEvent method exists, which is specific to WebSocket clients
    assert(typeof publicClient.watchContractEvent === 'function', 'publicClient should have watchContractEvent method for WebSocket transport');
});