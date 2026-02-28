import { createWebSocketClient, createClient } from '../clients.js';

describe('testing clients files', () => {
    test('createClient should create a configured client', () => {
        const { publicClient } = createClient('localhost');   

        expect(publicClient).toBeDefined();
        expect(publicClient).toHaveProperty('chain');
        expect(publicClient).toHaveProperty('transport');
        expect(publicClient.chain).toHaveProperty('id', 31337);
        expect(publicClient.transport.type).toBe('http');
    });

    test('createWebSocketClient should create a configured client', () => {
        const { publicClient } = createWebSocketClient('localhost');   

        expect(publicClient).toBeDefined();
        expect(publicClient).toHaveProperty('chain');
        expect(publicClient).toHaveProperty('transport');
        expect(publicClient.chain).toHaveProperty('id', 31337);
        expect(publicClient.transport.type).toBe('webSocket');
    });

    test('createWebSocketClient should create a client able to handle Smart Contract Events', () => {
        const { publicClient } = createWebSocketClient('localhost');

        // Check if the  the watchContractEvent method exists, which is specific to WebSocket clients
        expect(typeof publicClient.watchContractEvent).toBe('function');
    });
});