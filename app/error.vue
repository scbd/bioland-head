<template>
  <div class="error-page">
    <div class="error-content">
      <h1>{{ error.statusCode }}</h1>
      <p>{{ error.statusMessage || 'An error occurred' }}</p>
      <button @click="handleError" class="btn btn-primary">
        Go Home
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
interface ErrorProps {
  error: {
    statusCode: number;
    statusMessage?: string;
  };
}

const props = defineProps<ErrorProps>();

const handleError = () => clearError({ redirect: '/' });
</script>

<style scoped>
.error-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 2rem;
  background-color: #f8f9fa;
}

.error-content {
  text-align: center;
}

.error-content h1 {
  font-size: 6rem;
  font-weight: bold;
  color: #dc3545;
  margin-bottom: 1rem;
}

.error-content p {
  font-size: 1.5rem;
  color: #6c757d;
  margin-bottom: 2rem;
}

.btn {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  border-radius: 0.25rem;
  text-decoration: none;
  cursor: pointer;
}

.btn-primary {
  background-color: #007bff;
  color: white;
  border: none;
}

.btn-primary:hover {
  background-color: #0056b3;
}
</style>
