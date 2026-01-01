/**
 * Basic usage examples for Astra SDK
 */

import { AstraSDK, AstraSDKError } from '../index';

// Initialize the SDK
const sdk = new AstraSDK({
  apiKey: 'your-api-key-here',
  baseURL: 'https://api.astra.com',
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
});

// Example: GET request
async function getUsers() {
  try {
    const response = await sdk.get('/users');
    console.log('Users:', response.data);
    return response.data;
  } catch (error) {
    if (error instanceof AstraSDKError) {
      console.error('Error fetching users:', error.message);
    }
    throw error;
  }
}

// Example: POST request
async function createUser(userData: { name: string; email: string }) {
  try {
    const response = await sdk.post('/users', userData);
    console.log('Created user:', response.data);
    return response.data;
  } catch (error) {
    if (error instanceof AstraSDKError) {
      console.error('Error creating user:', error.message);
    }
    throw error;
  }
}

// Example: PUT request
async function updateUser(userId: string, userData: { name?: string; email?: string }) {
  try {
    const response = await sdk.put(`/users/${userId}`, userData);
    console.log('Updated user:', response.data);
    return response.data;
  } catch (error) {
    if (error instanceof AstraSDKError) {
      console.error('Error updating user:', error.message);
    }
    throw error;
  }
}

// Example: DELETE request
async function deleteUser(userId: string) {
  try {
    await sdk.delete(`/users/${userId}`);
    console.log('User deleted successfully');
  } catch (error) {
    if (error instanceof AstraSDKError) {
      console.error('Error deleting user:', error.message);
    }
    throw error;
  }
}

// Example: Custom request with query parameters
async function searchUsers(query: string) {
  try {
    const response = await sdk.get('/users', {
      params: {
        search: query,
        limit: 10,
      },
    });
    return response.data;
  } catch (error) {
    if (error instanceof AstraSDKError) {
      console.error('Error searching users:', error.message);
    }
    throw error;
  }
}

// Example: Update configuration
function updateSDKConfig() {
  sdk.updateConfig({
    timeout: 60000,
    headers: {
      'X-Custom-Header': 'value',
    },
  });
}

export {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  searchUsers,
  updateSDKConfig,
};

