/*
 * SPDX-FileCopyrightText: 2020 SAP SE or an SAP affiliate company <alexander.gilin@sap.com>
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, assert } from "chai";
import * as _ from "lodash";
import * as sinon from "sinon";
import * as nsVsMock from "./ext/mockVscode";
import { mockVscode } from "./ext/mockUtil";

mockVscode(nsVsMock.testVscode, "src/run-configuration.ts");
import * as cfViewCommands from "../src/cfViewCommands";
import * as cfLocal from "@sap/cf-tools/out/src/cf-local";
import * as chisel from "../src/chisel";
import { DependencyHandler } from "../src/run-configuration";
import * as utils from "../src/utils";
import { IBindContext, ConfigurationTarget, ConfigMetadata, BindState } from "@sap/wing-run-config-types";
import { messages } from "../src/messages";
import * as usageTracker from "../src/usage/usageTracker";

describe("run-configuration tests package", () => {
    let sandbox: any;
    let vscodeWindowMock: any;
    let usageMock: any;

    before(() => {
        sandbox = sinon.createSandbox();
    });

    beforeEach(() => {
        vscodeWindowMock = sandbox.mock(nsVsMock.testVscode.window);
        usageMock = sandbox.mock(usageTracker);
    });

    afterEach(() => {
        vscodeWindowMock.verify();
        usageMock.verify();
        sandbox.restore();
    });

    describe("DependencyHandler scope", () => {
        const instances = ['testInstance'];
        const bindContext: IBindContext = {
            runnableId: "",
            configData: {
                config: {
                    data: ConfigMetadata.get(ConfigurationTarget.launch)
                }
            },
            envPath: nsVsMock.testVscode.Uri.file("envPath"),
            depContext: {
                type: "hdi_type",
                displayName: "",
                bindable: true,
                displayType: "dysplayType",
                dependencyHandlerId: "dependencyHandlerId",
                data: {
                    resourceTag: "res-tag",
                    resourceName: "res-name"
                }
            }
        };


        it("constructor", () => {
            const id = 'test.Handler.id';
            expect(new DependencyHandler(id).getId()).to.be.equal(id);
        });

        it("getBindState - cloud", async () => {
            sandbox.stub(utils, "getEnvResources").withArgs(bindContext.envPath.fsPath).resolves({
                "hdi_type": BindState.cloud
            });
            expect(await new DependencyHandler("test.Handler.id").getBindState(bindContext)).to.be.equal(BindState.cloud);
        });

        it("getBindState - not defined", async () => {
            sandbox.stub(utils, "getEnvResources").withArgs(bindContext.envPath.fsPath).resolves({
                "type": BindState.cloud
            });
            expect(await new DependencyHandler("test.Handler.id").getBindState(bindContext)).to.be.equal(BindState.notbound);
        });

        it("getBindState - exception error", async () => {
            const error = new Error('some error');
            sandbox.stub(utils, "getEnvResources").withArgs(bindContext.envPath.fsPath).throws(error);
            vscodeWindowMock.expects("showErrorMessage").withExactArgs(error.message).resolves();
            expect(await new DependencyHandler("test.Handler.id").getBindState(bindContext)).to.be.equal(BindState.notbound);
        });

        it("bind - no instance", async () => {
            sandbox.stub(cfViewCommands, "bindLocalService").resolves([]);
            expect(await new DependencyHandler("test.Handler.id").bind(bindContext)).to.be.equal(undefined);
        });

        it("bind - exception", async () => {
            const error = new Error("my error");
            sandbox.stub(cfViewCommands, "bindLocalService").rejects(error);
            vscodeWindowMock.expects("showErrorMessage").withExactArgs(error.message).resolves();
            expect(await new DependencyHandler("test.Handler.id").bind(bindContext)).to.be.equal(undefined);
        });

        it("bind", async () => {
            sandbox.stub(cfViewCommands, "bindLocalService").resolves(['testInstance']);
            sandbox.stub(cfLocal, "cfGetInstanceMetadata").resolves({ serviceName: "testInstance", service: "resourceType" });
            usageMock.expects("trackChiselTask").never();
            expect(await new DependencyHandler("test.Handler.id").bind(bindContext)).to.be.deep.equal({ configData: bindContext.configData, resource: { name: "testInstance", type: "resourceType" } });
        });

        it("bind - with tag", async () => {
            const resourceTag: string = _.get(bindContext, "depContext.data.resourceTag");
            const resourceName: string = _.get(bindContext, "depContext.data.resourceName");
            const serviceType = [{
                name: bindContext.depContext.type,
                plan: _.get(bindContext.depContext, ['data', 'plan'], ''),
                tag: resourceTag ? resourceTag + resourceName : "",
                prompt: ""
            }];
            sandbox.stub(cfViewCommands, "bindLocalService").withArgs(serviceType).resolves(['testInstance']);
            sandbox.stub(cfLocal, "cfGetInstanceMetadata").resolves({ serviceName: "testInstance", service: "resourceType" });
            usageMock.expects("trackChiselTask").never();
            expect(await new DependencyHandler("test.Handler.id").bind(bindContext)).to.be.deep.equal({ configData: bindContext.configData, resource: { name: "testInstance", type: "resourceType" } });
        });

        it("bind - no tag", async () => {
            const serviceType = [{
                name: bindContext.depContext.type,
                plan: _.get(bindContext.depContext, ['data', 'plan'], ''),
                tag: "",
                prompt: ""
            }];
            const copyContext = _.cloneDeep(bindContext);
            copyContext.depContext.data = {};
            sandbox.stub(cfViewCommands, "bindLocalService").withArgs(serviceType).resolves(['testInstance']);
            sandbox.stub(cfLocal, "cfGetInstanceMetadata").resolves({ serviceName: "testInstance", service: "resourceType" });
            usageMock.expects("trackChiselTask").never();
            expect(await new DependencyHandler("test.Handler.id").bind(copyContext)).to.be.deep.equal({ configData: copyContext.configData, resource: { name: "testInstance", type: "resourceType" } });
        });

        it("bind - create chisel task - return undefined", async () => {
            sandbox.stub(chisel, "checkAndCreateChiselTask").withArgs(bindContext.envPath.fsPath, instances.join('&')).resolves(undefined);
            sandbox.stub(cfViewCommands, "bindLocalService").resolves(instances);
            sandbox.stub(cfLocal, "cfGetInstanceMetadata").resolves({ serviceName: "testInstance", service: "resourceType" });
            usageMock.expects("trackChiselTask").withExactArgs("Chisel Task", ["CF tools"]).resolves();
            const copyContext = _.cloneDeep(bindContext);
            copyContext.depContext.data = { isCreateChiselTask: true };
            expect(await new DependencyHandler("test.Handler.id").bind(copyContext)).to.be.deep.equal({ configData: copyContext.configData, resource: { name: "testInstance", type: "resourceType" } });
        });

        it("bind - create chisel task - no depended tasks", async () => {
            const chiselLabel = "chiselLabel";
            sandbox.stub(chisel, "checkAndCreateChiselTask")
                .withArgs(_.get(bindContext, "envPath.fsPath"), instances.join('&'))
                .resolves({ label: chiselLabel, data: { context: "some" } });
            sandbox.stub(cfViewCommands, "bindLocalService").resolves(instances);
            sandbox.stub(cfLocal, "cfGetInstanceMetadata").resolves({ serviceName: "testInstance", service: "resourceType" });
            const copyContext = _.cloneDeep(bindContext);
            copyContext.depContext.data = { isCreateChiselTask: true };
            usageMock.expects("trackChiselTask").withExactArgs("Chisel Task", ["CF tools"]).resolves();
            copyContext.configData.dependentTasks = undefined;
            vscodeWindowMock.expects("showInformationMessage").withExactArgs(`A task for opening the VPN tunnel to the Cloud Foundry space has been created. Name: '${chiselLabel}'`).resolves();
            expect(await new DependencyHandler("test.Handler.id").bind(copyContext)).to.be.deep.equal({ configData: copyContext.configData, resource: { name: "testInstance", type: "resourceType" } });
        });

        it("bind - create chisel task - depended tasks", async () => {
            const chiselLabel = "chiselLabel";
            const tsk = { name: 'task' };
            const chiselJson = { label: chiselLabel, data: { context: "some" } };
            sandbox.stub(chisel, "checkAndCreateChiselTask")
                .withArgs(bindContext.envPath.fsPath, instances.join('&'))
                .resolves(chiselJson);
            sandbox.stub(cfViewCommands, "bindLocalService").resolves(instances);
            sandbox.stub(cfLocal, "cfGetInstanceMetadata").resolves({ serviceName: "testInstance", service: "resourceType" });
            const copyContext = _.cloneDeep(bindContext);
            copyContext.configData.config.data.envFile = undefined;
            copyContext.configData.dependentTasks = [tsk];
            copyContext.depContext.data = { isCreateChiselTask: true };
            usageMock.expects("trackChiselTask").withExactArgs("Chisel Task", ["CF tools"]).resolves();
            vscodeWindowMock.expects("showInformationMessage").withExactArgs(`A task for opening the VPN tunnel to the Cloud Foundry space has been created. Name: '${chiselLabel}'`).resolves();
            expect(await new DependencyHandler("test.Handler.id").bind(copyContext)).to.be.deep.equal({ configData: copyContext.configData, resource: { name: "testInstance", type: "resourceType" } });
            assert.deepEqual(copyContext.configData.dependentTasks, [tsk, chiselJson]);
        });

        it("unbind", async () => {
            const configurationData = { config: { data: {}, type: ConfigurationTarget.launch }, dependentTasks: [{}] };
            configurationData.dependentTasks = [];
            const property = { resourceName: 'propName', envPath: "env Path", resourceData: { label: "resource-type" } };
            sandbox.stub(utils, "removeResourceFromEnv").resolves(property);
            vscodeWindowMock.expects("showInformationMessage").withExactArgs(messages.service_unbound_successful(property.resourceName)).resolves();
            assert.deepEqual(await new DependencyHandler("test.Handler.id").unbind(bindContext), { configData: configurationData, resource: { name: "propName", type: "resource-type", data: { label: "resource-type" } } });
        });

        it("unbind - empty property", async () => {
            const configurationData = { config: { data: {}, type: ConfigurationTarget.launch }, dependentTasks: [{}] };
            configurationData.dependentTasks = [];
            const property = {};
            sandbox.stub(utils, "removeResourceFromEnv").resolves(property);
            vscodeWindowMock.expects("showInformationMessage").withExactArgs(messages.service_unbound_successful(_.get(property, "resourceName"))).resolves();
            assert.deepEqual(await new DependencyHandler("test.Handler.id").unbind(bindContext), { configData: configurationData, resource: { name: "", type: "", data: {} } });
        });

        it("unbind - exception", async () => {
            const error = new Error("my error");
            sandbox.stub(utils, "removeResourceFromEnv").rejects(error);
            vscodeWindowMock.expects("showErrorMessage").withExactArgs(error.message).resolves();
            expect(await new DependencyHandler("test.Handler.id").unbind(bindContext)).to.be.equal(undefined);
        });
    });
});
