#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { WordToPdfStack } from '../lib/word-to-pdf-stack';

const app = new cdk.App();
new WordToPdfStack(app, 'WordToPdfStack');
