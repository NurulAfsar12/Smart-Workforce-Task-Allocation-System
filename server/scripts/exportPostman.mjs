import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'docs', 'SmartWorkforce.postman_collection.json');

const collection = {
  info: {
    name: 'Smart Workforce & Task Allocation',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'API collection for the Smart Workforce system. Set {{baseUrl}} (e.g. http://localhost:5000) and {{token}}.',
  },
  item: [
    {
      name: 'Auth',
      item: [
        { name: 'Login', request: { method: 'POST', header: [{key:'Content-Type',value:'application/json'}], body: {mode:'raw',raw:'{"email":"admin@smartworkforce.com","password":"Password123!"}'}, url: {raw:'{{baseUrl}}/api/auth/login',host:['{{baseUrl}}'],path:['api','auth','login']}} },
        { name: 'Me', request: { method: 'GET', header: [{key:'Authorization',value:'Bearer {{token}}'}], url: {raw:'{{baseUrl}}/api/auth/me',host:['{{baseUrl}}'],path:['api','auth','me']}} },
      ],
    },
    {
      name: 'Health',
      item: [
        { name: 'Health', request: { method: 'GET', url: {raw:'{{baseUrl}}/health',host:['{{baseUrl}}'],path:['health']}} },
      ],
    },
    {
      name: 'Departments',
      item: [
        { name: 'List', request: { method: 'GET', header: [{key:'Authorization',value:'Bearer {{token}}'}], url: {raw:'{{baseUrl}}/api/departments',host:['{{baseUrl}}'],path:['api','departments']}} },
      ],
    },
    {
      name: 'Skills',
      item: [
        { name: 'List', request: { method: 'GET', header: [{key:'Authorization',value:'Bearer {{token}}'}], url: {raw:'{{baseUrl}}/api/skills',host:['{{baseUrl}}'],path:['api','skills']}} },
      ],
    },
    {
      name: 'Employees',
      item: [
        { name: 'List', request: { method: 'GET', header: [{key:'Authorization',value:'Bearer {{token}}'}], url: {raw:'{{baseUrl}}/api/employees',host:['{{baseUrl}}'],path:['api','employees']}} },
      ],
    },
    {
      name: 'Projects',
      item: [
        { name: 'List', request: { method: 'GET', header: [{key:'Authorization',value:'Bearer {{token}}'}], url: {raw:'{{baseUrl}}/api/projects',host:['{{baseUrl}}'],path:['api','projects']}} },
      ],
    },
    {
      name: 'Tasks',
      item: [
        { name: 'List', request: { method: 'GET', header: [{key:'Authorization',value:'Bearer {{token}}'}], url: {raw:'{{baseUrl}}/api/tasks',host:['{{baseUrl}}'],path:['api','tasks']}} },
      ],
    },
    {
      name: 'Allocation',
      item: [
        { name: 'Pending', request: { method: 'GET', header: [{key:'Authorization',value:'Bearer {{token}}'}], url: {raw:'{{baseUrl}}/api/allocation/pending',host:['{{baseUrl}}'],path:['api','allocation','pending']}} },
      ],
    },
    {
      name: 'Workload',
      item: [
        { name: 'List', request: { method: 'GET', header: [{key:'Authorization',value:'Bearer {{token}}'}], url: {raw:'{{baseUrl}}/api/workload',host:['{{baseUrl}}'],path:['api','workload']}} },
        { name: 'Heatmap (28 days)', request: { method: 'GET', header: [{key:'Authorization',value:'Bearer {{token}}'}], url: {raw:'{{baseUrl}}/api/workload/heatmap?days=28',host:['{{baseUrl}}'],path:['api','workload','heatmap'],query:[{key:'days',value:'28'}]}} },
      ],
    },
    {
      name: 'Reports',
      item: [
        { name: 'Dashboard', request: { method: 'GET', header: [{key:'Authorization',value:'Bearer {{token}}'}], url: {raw:'{{baseUrl}}/api/reports/dashboard',host:['{{baseUrl}}'],path:['api','reports','dashboard']}} },
        { name: 'Workload', request: { method: 'GET', header: [{key:'Authorization',value:'Bearer {{token}}'}], url: {raw:'{{baseUrl}}/api/reports/workload',host:['{{baseUrl}}'],path:['api','reports','workload']}} },
        { name: 'Skills', request: { method: 'GET', header: [{key:'Authorization',value:'Bearer {{token}}'}], url: {raw:'{{baseUrl}}/api/reports/skills',host:['{{baseUrl}}'],path:['api','reports','skills']}} },
      ],
    },
  ],
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(collection, null, 2), 'utf8');
console.log('Wrote', OUT);
