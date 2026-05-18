const { Project } = require('ts-morph');
const project = new Project();
const sf = project.addSourceFileAtPath('node_modules/@wix/auto_sdk_ecom_checkout/build/cjs/index.d.ts');
const createOrder = sf.getInterface('CreateOrderOptions');
if (createOrder) {
    console.log('CreateOrderOptions:');
    createOrder.getProperties().forEach((p: any) => console.log('  ' + p.getName() + ': ' + p.getType().getText()));
} else {
    console.log('CreateOrderOptions not found');
}
